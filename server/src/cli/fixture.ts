/**
 * A local stand-in for the provider, for developing and demoing the app
 * without spending tokens.
 *
 *   pnpm -F server fixture        # listens on http://127.0.0.1:3009/v1
 *
 * Then set Base URL to http://127.0.0.1:3009/v1 in Settings. It speaks the
 * OpenAI /chat/completions shape and reports reasoning tokens from
 * usage.completion_tokens_details, exactly like the real thing.
 *
 * This is a development tool. Real runs go to the real provider.
 */

import { createServer } from 'node:http';
import { MockTransport } from '../mockTransport.ts';
import type { RunConfig } from '../types.ts';

const PORT = Number(process.env['FIXTURE_PORT'] ?? 3009);
/** Optional per-call delay, so progress streaming is observable in dev. */
const DELAY_MS = Number(process.env['FIXTURE_DELAY_MS'] ?? 0);
const transport = new MockTransport('fixture');

const server = createServer((req, res) => {
  // Only the documented route. Anything else is a genuine 404, so a mistyped
  // Base URL in the app surfaces the provider's real error.
  const path = (req.url ?? '').split('?')[0] ?? '';
  if (req.method !== 'POST' || path !== '/v1/chat/completions') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        error: {
          message: `Unknown route: ${req.method} ${path}. The fixture only serves POST /v1/chat/completions.`,
          type: 'invalid_request_error',
        },
      }),
    );
    return;
  }

  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', async () => {
    let body: { model?: string; messages?: { role: string; content: string }[]; chat_template_kwargs?: { enable_thinking?: boolean } };
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Body was not valid JSON.' } }));
      return;
    }

    const model = body.model ?? 'unknown';
    const question = body.messages?.findLast((m) => m.role === 'user')?.content ?? '';
    const config: RunConfig = {
      baseUrl: '',
      apiKey: '',
      modelA: 'deepseek-v4-flash-0731',
      modelB: 'deepseek-v4.1-flash',
      temperature: 0,
      maxTokens: 1600,
      disableReasoning: body.chat_template_kwargs?.enable_thinking === false,
    };

    try {
      const result = await transport.call(model, question, config, config.maxTokens);
      if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
      const payload = {
        id: `fixture-${Date.now()}`,
        object: 'chat.completion',
        model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: result.content },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          total_tokens: result.promptTokens + result.completionTokens,
          completion_tokens_details: { reasoning_tokens: result.reasoningTokens },
        },
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: err instanceof Error ? err.message : String(err) } }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fixture provider listening on http://127.0.0.1:${PORT}/v1`);
  console.log('Set Base URL to that value in the app to sweep without spending tokens.');
});