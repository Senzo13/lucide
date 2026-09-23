#!/usr/bin/env node
/**
 * Tiny stdio client for the `awwwards-mcp` server.
 *
 * The Codex app only exposes MCP servers it spawned itself at process start,
 * so this is a stopgap that speaks JSON-RPC to `npx -y awwwards-mcp` directly
 * from the shell. Same protocol, same results, callable mid-session.
 *
 * Usage:
 *   node scripts/awwwards.mjs list
 *   node scripts/awwwards.mjs call search_sites query="dark 3d portfolio"
 *   node scripts/awwwards.mjs call get_site_details slug=alche-studio
 *   node scripts/awwwards.mjs raw '{ "jsonrpc": "2.0", ... }'
 *
 * Inline images come back as base64 and are written to .shots/awwwards/.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SERVER = 'awwwards-mcp';
const OUT_DIR = path.resolve('.shots', 'awwwards');
const TIMEOUT_MS = Number(process.env.AWWWARDS_CALL_TIMEOUT_MS ?? 300_000);

/**
 * Prefer the globally installed copy: it sits next to `playwright` and
 * `ffmpeg-static`, so the capture tools can resolve their optional deps, and
 * it skips npx's resolution pass on every call.
 */
function resolveServer() {
  const globalRoot = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', SERVER, 'dist', 'cli.js')
    : null;
  if (globalRoot && existsSync(globalRoot)) {
    return { command: process.execPath, args: [globalRoot] };
  }
  const isWin = process.platform === 'win32';
  return { command: isWin ? 'npx.cmd' : 'npx', args: ['-y', SERVER] };
}

/** Coerce CLI strings into the JSON types the server expects. */
function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') || value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const eq = arg.indexOf('=');
    if (eq === -1) {
      out[arg] = true;
      continue;
    }
    out[arg.slice(0, eq)] = coerce(arg.slice(eq + 1));
  }
  return out;
}

class StdioClient {
  constructor() {
    const { command, args } = resolveServer();
    this.child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
      windowsHide: true,
    });
    this.buf = '';
    this.pending = new Map();
    this.nextId = 1;
    this.stderr = '';
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk;
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.#onData(chunk));
    this.child.on('error', (err) => this.#failAll(err));
    this.child.on('exit', (code) => {
      if (this.pending.size) {
        this.#failAll(
          new Error(`server exited (code ${code})\n${this.stderr.slice(-2000)}`),
        );
      }
    });
  }

  #onData(chunk) {
    this.buf += chunk;
    let index;
    while ((index = this.buf.indexOf('\n')) !== -1) {
      const line = this.buf.slice(0, index).trim();
      this.buf = this.buf.slice(index + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id === undefined || msg.id === null) continue;
      const entry = this.pending.get(msg.id);
      if (!entry) continue;
      this.pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    }
  }

  #failAll(err) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout after ${TIMEOUT_MS}ms: ${method}`));
      }, TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${payload}\n`);
    });
  }

  notify(method, params) {
    this.child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`,
    );
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
  }
}

async function render(content) {
  const text = [];
  let imageIndex = 0;
  for (const block of content ?? []) {
    if (block.type === 'text') {
      text.push(block.text);
    } else if (block.type === 'image') {
      await mkdir(OUT_DIR, { recursive: true });
      const file = path.join(
        OUT_DIR,
        `${process.env.AWWWARDS_TAG ?? 'shot'}-${String(++imageIndex).padStart(2, '0')}.png`,
      );
      await writeFile(file, Buffer.from(block.data, 'base64'));
      text.push(`[image → ${path.relative(process.cwd(), file)}]`);
    } else if (block.type === 'resource') {
      text.push(`[resource ${block.resource?.uri ?? '?'}]`);
    } else {
      text.push(`[${block.type}]`);
    }
  }
  if (text.length) console.log(text.join('\n'));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const client = new StdioClient();
  try {
    await client.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'lucide-awwwards-cli', version: '1.0.0' },
    });
    client.notify('notifications/initialized', {});

    if (command === 'list' || command === undefined) {
      const { tools } = await client.request('tools/list', {});
      for (const tool of tools) {
        const params = Object.keys(tool.inputSchema?.properties ?? {});
        console.log(`- ${tool.name}(${params.join(', ')})\n  ${tool.description.split('\n')[0]}`);
      }
      return;
    }

    if (command === 'call') {
      const name = args._ ?? rest.find((a) => !a.includes('='));
      delete args._;
      delete args[name];
      delete args.true;
      const result = await client.request('tools/call', {
        name,
        arguments: args,
      });
      if (result.isError) {
        console.error(`tool error: ${JSON.stringify(result)}`);
        process.exitCode = 1;
      }
      await render(result.content);
      return;
    }

    if (command === 'raw') {
      const result = await client.request(args.method ?? 'tools/list', args.params ?? {});
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    throw new Error(`unknown command: ${command}`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
}).finally(() => {
  // `npx` runs the real server in a grandchild process on Windows, and neither
  // half reliably releases the event loop — so end the process on purpose.
  setTimeout(() => process.exit(process.exitCode ?? 0), 50);
});
