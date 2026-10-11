export type PhotoCandidate = { cardId: string; score: number };
export type PhotoMatch = {
  id: string;
  cropUrl: string;
  candidates: PhotoCandidate[];
  selectedCardId: string | null;
  confidence: 'high' | 'review';
};
export type PhotoReadResult = {
  imageUrl: string;
  width: number;
  height: number;
  matches: PhotoMatch[];
  referenceCount: number;
  warnings: string[];
};

export async function recognizeDeckPhoto(
  file: File,
  options: {
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
  } = {},
): Promise<PhotoReadResult> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('写真は20MB以下のJPEG・PNG・WebP画像を選んでください。');
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error(
      'JPEG・PNG・WebP画像を選んでください。HEICはJPEGに変換してください。',
    );
  }
  onProgress?.('写真を読み込んでいます…');
  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        img.src = '';
        cleanup();
        reject(new DOMException('中断しました', 'AbortError'));
      };
      const cleanup = () => {
        signal?.removeEventListener('abort', abort);
        img.onload = null;
        img.onerror = null;
      };
      img.onload = () => {
        cleanup();
        resolve();
      };
      img.onerror = () => {
        cleanup();
        reject(
          new Error(
            '画像を開けませんでした。別のJPEG・PNG画像を試してください。',
          ),
        );
      };
      signal?.addEventListener('abort', abort, { once: true });
      img.src = objectUrl;
    });
    signal?.throwIfAborted();
    if (
      img.naturalWidth * img.naturalHeight > 50_000_000 ||
      img.naturalWidth < 100 ||
      img.naturalHeight < 100
    ) {
      throw new Error(
        '画像のサイズが対応範囲外です。長辺100〜8000ピクセル程度の写真を選んでください。',
      );
    }
    const scale = Math.min(
      1,
      1800 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('このブラウザでは画像を処理できません。');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const imageUrl = canvas.toDataURL('image/jpeg', 0.85);
    const result = await runPhotoWorker(pixels, options);
    signal?.throwIfAborted();
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = 224;
    cropCanvas.height = 320;
    const cropContext = cropCanvas.getContext('2d');
    if (!cropContext)
      throw new Error('画像の確認用表示を作成できませんでした。');
    const matches: PhotoMatch[] = result.matches.map((match, index) => {
      cropContext.putImageData(
        new ImageData(new Uint8ClampedArray(match.pixels), 224, 320),
        0,
        0,
      );
      return {
        id: String(index + 1),
        cropUrl: cropCanvas.toDataURL('image/jpeg', 0.82),
        candidates: match.candidates,
        selectedCardId: match.selectedCardId,
        confidence: match.confidence,
      };
    });
    return {
      imageUrl,
      width: canvas.width,
      height: canvas.height,
      matches,
      referenceCount: result.referenceCount,
      warnings: result.warnings,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

type WorkerMatch = Omit<PhotoMatch, 'id' | 'cropUrl'> & { pixels: ArrayBuffer };
type WorkerResult = {
  matches: WorkerMatch[];
  referenceCount: number;
  warnings: string[];
};
type WorkerMessage =
  | { type: 'progress'; message: string }
  | { type: 'error'; message: string }
  | ({ type: 'result' } & WorkerResult);

function runPhotoWorker(
  pixels: ImageData,
  {
    signal,
    onProgress,
  }: { signal?: AbortSignal; onProgress?: (message: string) => void },
): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      import.meta.env.BASE_URL + 'photo-reader.worker.js',
    );
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('中断しました', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          '読み取りに時間がかかりすぎています。カードを少なくして撮影し直してください。',
        ),
      );
    }, 120_000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    worker.onerror = () => {
      cleanup();
      reject(
        new Error(
          '読み取り機能を起動できませんでした。通信状態とブラウザを確認して、もう一度試してください。',
        ),
      );
    };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress?.(message.message);
        return;
      }
      cleanup();
      if (message.type === 'error') reject(new Error(message.message));
      else resolve(message);
    };
    worker.postMessage(
      {
        width: pixels.width,
        height: pixels.height,
        pixels: pixels.data.buffer,
      },
      [pixels.data.buffer],
    );
  });
}
