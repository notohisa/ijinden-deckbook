'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LEGACY_EXPORT_BOOKMARKLET } from '@/lib/legacy-deck-exporter';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChooseFile: () => void;
};

export function LegacyMigrationDialog({
  open,
  onOpenChange,
  onChooseFile,
}: Props) {
  const [message, setMessage] = useState('');
  const [showCode, setShowCode] = useState(false);

  async function copyBookmark() {
    try {
      await navigator.clipboard.writeText(LEGACY_EXPORT_BOOKMARKLET);
      setMessage(
        '登録用のアドレスをコピーしました。ブックマークのURL欄に貼り付けてください。',
      );
    } catch {
      setShowCode(true);
      setMessage('下の登録用アドレスを選択してコピーしてください。');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-[#f8f5ee] sm:max-w-xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-display text-xl">
            旧サイトからまとめて移行
          </DialogTitle>
          <DialogDescription>
            旧サイトのマイデッキを1つのファイルに書き出して、このデッキ帳へ取り込みます。
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4">
          <li className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
            <h2 className="font-medium">1. 書き出し用のブックマークを登録</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">
              パソコンでは、下のリンクをブラウザのブックマークバー（お気に入りバー）へドラッグしてください。登録は初回だけです。
            </p>
            {/* oxlint-disable-next-line next/no-html-link-for-pages -- This draggable anchor is replaced with a bookmarklet, not used for navigation. */}
            <a
              href="./"
              // This intentional, self-contained bookmarklet runs only on the
              // legacy origin. Setting the attribute avoids React's javascript:
              // URL replacement; clicking here never executes the exporter.
              ref={(element) => {
                element?.setAttribute('href', LEGACY_EXPORT_BOOKMARKLET);
              }}
              draggable
              onClick={(event) => {
                event.preventDefault();
                setMessage(
                  'このリンクをブックマークバーへドラッグして登録してください。スマートフォンでは下の登録手順を開いてください。',
                );
              }}
              className="inline-flex min-h-11 items-center rounded-lg border border-dashed border-[var(--green)] bg-emerald-50 px-4 py-2 font-medium text-emerald-950 underline underline-offset-4"
            >
              旧サイトの全デッキを書き出す
            </a>
            <details className="rounded-lg bg-[var(--soft)] p-3 text-sm leading-6">
              <summary className="cursor-pointer font-medium">
                スマートフォン・ドラッグできない場合
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--muted)]">
                <li>このページをいったんブックマークに登録します。</li>
                <li>下のボタンで登録用アドレスをコピーします。</li>
                <li>
                  登録したブックマークを編集し、名前を「旧デッキ書き出し」、URLをコピーしたアドレスに置き換えて保存します。
                </li>
              </ol>
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11"
                onClick={() => void copyBookmark()}
              >
                登録用アドレスをコピー
              </Button>
              {showCode && (
                <label className="mt-3 block">
                  登録用アドレス
                  <textarea
                    readOnly
                    value={LEGACY_EXPORT_BOOKMARKLET}
                    onFocus={(event) => event.currentTarget.select()}
                    className="mt-1 h-24 w-full break-all rounded border bg-white p-2 text-xs"
                  />
                </label>
              )}
              <p className="mt-2 text-xs text-[var(--muted)]">
                URLの先頭の「javascript:」も含めて保存してください。
              </p>
            </details>
          </li>
          <li className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
            <h2 className="font-medium">2. 旧サイトを開いて書き出す</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">
              デッキを保存している端末・ブラウザで、普段使っているブックマークや閲覧履歴から旧サイトを開いてください。旧サイトを表示したまま、書き出し用に登録したブックマークを実行すると、全デッキのJSONファイルが保存されます。
            </p>
            <p className="text-xs leading-5 text-[var(--muted)]">
              スマートフォンでは、旧サイトを表示したままブックマークを選びます。Chromeで動かない場合は、アドレス欄に登録名を入力し、候補のブックマークを選んでください。
            </p>
          </li>
          <li className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
            <h2 className="font-medium">3. ファイルを選んで取り込む</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">
              この画面に戻り、書き出したJSONファイルを選びます。内容を確認して、移したいデッキだけを取り込めます。
            </p>
            <Button
              type="button"
              className="h-auto min-h-11 whitespace-normal"
              onClick={() => {
                onOpenChange(false);
                onChooseFile();
              }}
            >
              旧サイトのJSONファイルを選ぶ
            </Button>
          </li>
        </ol>
        <p className="text-sm leading-6 text-[var(--muted)]">
          同じカード構成は重複を省き、同名で構成が違うデッキは「旧#番号」を付けて残します。旧サイトのデータは削除されず、処理は端末内で完結します。
        </p>
        <p className="text-xs leading-5 text-[var(--muted)]">
          更新日時は取り込んだ時刻になります。元の保存日時は書き出したファイルに残ります。まだマイデッキに保存していないレシピは対象に含まれません。
        </p>
        {message && (
          <output className="block rounded-lg bg-[var(--soft)] p-3 text-sm leading-6">
            {message}
          </output>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
          >
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
