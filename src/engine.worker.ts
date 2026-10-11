import init, { generate, check, hint, verify } from './wasm/cross_math_core';

const ready = init();
self.onmessage = async ({ data }: MessageEvent) => {
  try {
    await ready;
    let result: string;
    if (data.method === 'generate') result = generate(data.seed, data.difficulty);
    else if (data.method === 'check') result = check(JSON.stringify(data.puzzle), JSON.stringify(data.board));
    else if (data.method === 'hint') result = hint(JSON.stringify(data.puzzle), JSON.stringify(data.board));
    else if (data.method === 'verify') result = verify(JSON.stringify(data.puzzle));
    else throw new Error('Unknown engine method');
    self.postMessage({ id: data.id, result: JSON.parse(result) });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
