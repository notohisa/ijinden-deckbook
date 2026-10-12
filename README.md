# イジンデン デッキ帳

[公開サイト](https://notohisa.github.io/ijinden-deckbook/)。React / TypeScript の静的アプリです。GitHub Pages 版のデッキ保存・共有・テキスト解析はブラウザ内で動きます。写真取り込みは現在無効です。

## 開発・確認

Node.js 22.13 以上、pnpm 10 を使用します。

```sh
pnpm install --frozen-lockfile
pnpm dev:pages
```

GitHub Pages 用の入口は `index.html` → `pages-entry.tsx` → `app/page.tsx`、ビルド設定は `vite.pages.config.ts` です。`dev` / `build` / `start` と `vite.config.ts` は既存の Sites / vinext 環境用として残しています。Pages の確認には `*:pages` を使用してください。

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build:pages
pnpm exec playwright install chromium
pnpm test:browser
```

ブラウザテストはビルド済み `dist-pages` をローカルのポート 5190 で起動します。既存 Chrome を使う場合は `PLAYWRIGHT_CHANNEL=chrome`、公開環境を確認する場合は `PLAYWRIGHT_BASE_URL=https://notohisa.github.io/ijinden-deckbook/` を環境変数に設定します。テスト用ブラウザの隔離された保存領域を使用します。

## 責務と変更箇所

| 対象                                                           | 担当                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `app/page.tsx`                                                 | タブ・ダイアログの構成、通知、取り込みと書き出しの入口     |
| `hooks/use-deck-book.ts`                                       | デッキ操作、保存キュー、タブ間の同期、競合・保存失敗の通知 |
| `lib/deck-archive-repository.ts`                               | 最新保存データを読み直してから変更する処理、競合の検出     |
| `lib/deck-storage.ts`                                          | 保存形式の検証と旧形式の移行、不正データの保護             |
| `lib/deck-operations.ts`                                       | デッキの追加・変更などのデータ操作                         |
| `lib/deck-text-import.ts` / `deck-import.ts` / `deck-share.ts` | テキスト・JSON・共有リンクの解析と出力                     |
| `components/deck-simulator.tsx`                                | 共通セッションと二つの表示モードの接続                     |
| `hooks/use-simulator-session.ts`                               | 開始・ドロー・マリガン、表示モードをまたぐセッション保持   |
| `hooks/use-board-simulator.ts` / `use-simple-simulator.ts`     | 各表示での操作と一時的な画面状態                           |
| `components/simulator/`                                        | 盤面・ゾーン・カードの表示                                 |
| `lib/simulator-session.ts` / `simulator.ts`                    | UI と単体テストが共有するシミュレーターのデータ操作        |
| `components/help.tsx`                                          | 利用者向けヘルプ                                           |

カード情報は `app/ijinden-cards.ts` と `app/custom-cards.ts`、ルールは `lib/deck-validator.ts` と `data/regulations.ts` にあります。保存データはカード ID と枚数を保持し、表示用情報と分けています。

## 保存と複数タブ

- 既存の `ijinden-deckbook-v1` キーと version 2 の保存形式を維持します。旧 version 1 は検証後に移行します。
- 書き込みは `navigator.locks` の共通ロックを取得し、最新の保存データを読み直してから必要な部分だけ更新します。保存済みデッキと作業中レシピを別の操作として扱います。
- 作業中レシピが他タブと競合した場合は、そのタブの自動保存を止めます。別名での保存か、最新レシピの読み込みを利用者が選択します。タブ内の復元用データは `sessionStorage` に保持します。
- インポートや削除は、確認時点の保存済みデッキがロック待ちの間に変更されていたら中断し、更新した内容の再確認を求めます。
- Web Locks が利用できない場合は読み取り・コピー・書き出しを残し、書き込みを止めて画面に案内します。保存失敗時に成功表示は出しません。不正な保存データを空のデータで上書きしません。
- 古いコードを開いたままのタブはこのロックに参加できません。この修正の公開後は開いているデッキ帳のタブをすべて再読み込みしてください。

保存処理を追加するときは `useDeckBook` と repository を通します。画面コンポーネントからデッキの `localStorage` キーを直接書き換えないでください。

## 公開と回帰防止

`main` への push で GitHub Actions が lint・型チェック・単体テスト・ビルド・ブラウザテストを実行し、すべて成功した場合に GitHub Pages に公開します。ブラウザテストは複数タブの保存競合、再読み込みによる復元、インポート、保存失敗、シミュレーターの実操作を確認します。失敗時の trace は Actions の artifact から取得できます。

公開を戻す場合は対象コミットを `git revert` し、同じ検証を通して再公開します。コードを戻しても端末内のデッキデータは巻き戻らないため、保存形式を変える変更は別途移行・互換性のテストが必要です。
