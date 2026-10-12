function runLegacyDeckExporter(): void {
  const expectedOrigin = 'https://sweetpotato.github.io';
  const expectedPath = '/ijinden-deck-builder/';
  const databaseName = 'ijinden-deck-builder';
  const storeName = 'decks';

  if (
    location.origin !== expectedOrigin ||
    location.pathname !== expectedPath
  ) {
    alert('旧サイトのデッキ画面でブックマークレットを実行してください。');
    return;
  }

  let database: IDBDatabase | null = null;
  let finished = false;
  let upgradeNeeded = false;

  function closeDatabase(): void {
    if (!database) return;
    database.close();
    database = null;
  }

  function fail(message: string): void {
    if (finished) return;
    finished = true;
    closeDatabase();
    alert(message);
  }

  let openRequest: IDBOpenDBRequest;
  try {
    openRequest = indexedDB.open(databaseName);
  } catch {
    fail('旧サイトの保存データを開けませんでした。');
    return;
  }

  openRequest.onupgradeneeded = function () {
    upgradeNeeded = true;
    try {
      openRequest.transaction?.abort();
    } catch {
      fail('旧サイトの保存データが見つかりませんでした。');
    }
  };

  openRequest.onblocked = function () {
    fail(
      '旧サイトの保存データを開けませんでした。別のタブを閉じて再試行してください。',
    );
  };

  openRequest.onerror = function () {
    fail(
      upgradeNeeded
        ? '旧サイトの保存データが見つかりませんでした。旧サイトを開いてデッキを保存してから再試行してください。'
        : '旧サイトの保存データを読み込めませんでした。',
    );
  };

  openRequest.onsuccess = function () {
    database = openRequest.result;
    if (finished) {
      closeDatabase();
      return;
    }
    if (!database.objectStoreNames.contains(storeName)) {
      fail('旧サイトのデッキ保存領域が見つかりませんでした。');
      return;
    }

    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      let rows: unknown;

      request.onsuccess = function () {
        rows = request.result;
      };
      request.onerror = function () {
        fail('旧サイトのデッキを読み込めませんでした。');
      };
      transaction.onerror = function () {
        fail('旧サイトのデッキを読み込めませんでした。');
      };
      transaction.onabort = function () {
        fail('旧サイトのデッキ読み込みが中断されました。');
      };
      transaction.oncomplete = function () {
        if (finished) return;
        finished = true;
        closeDatabase();

        if (!Array.isArray(rows) || rows.length === 0) {
          alert(
            '書き出せるデッキがありません。旧サイトでデッキを保存してから再試行してください。',
          );
          return;
        }

        let objectUrl: string | null = null;
        try {
          const backup = {
            version: 1,
            type: 'ijinden-deck-builder-backup',
            exportedAt: new Date().toISOString(),
            decks: rows,
          };
          const blob = new Blob([JSON.stringify(backup, null, 2)], {
            type: 'application/json;charset=utf-8',
          });
          objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download =
            'ijinden-deck-builder-backup-' +
            new Date().toISOString().slice(0, 10) +
            '.json';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(function () {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
          }, 0);
          alert('旧サイトのデッキをJSONファイルに書き出しました。');
        } catch {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          alert('JSONファイルを作成できませんでした。');
        }
      };
    } catch {
      fail('旧サイトのデッキを読み込めませんでした。');
    }
  };
}

const bookmarkletSource = `(${runLegacyDeckExporter.toString()})();`;

/** A self-contained, read-only exporter for the legacy site's IndexedDB. */
export const LEGACY_EXPORT_BOOKMARKLET =
  'javascript:' + encodeURIComponent(bookmarkletSource);
