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
        '登録用のアドレスをコピーしました。ブックマークの編集画面の「URL」欄に貼り付けてください。',
      );
    } catch {
      setShowCode(true);
      setMessage('下の登録用アドレスを選択してコピーしてください。');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-[var(--paper)] sm:max-w-xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-display text-xl">
            旧サイトからまとめて移行
          </DialogTitle>
          <DialogDescription>
            旧サイトのマイデッキを1つのファイルに書き出して、このデッキ帳へ取り込みます。
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4">
          <li className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <h2 className="font-medium">1. 新サイトで準備（初回のみ）</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">
              パソコンでは、下のリンクをブックマークバー（お気に入りバー）へドラッグ（つかんで移動）して登録します。
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
              className="inline-flex min-h-11 items-center rounded-lg border border-dashed border-[var(--green)] bg-[var(--success-bg)] px-4 py-2 font-medium text-[var(--success-foreground)] underline underline-offset-4"
            >
              旧サイトの全デッキを書き出す
            </a>
            <p className="text-xs leading-5 text-[var(--muted)]">
              この画面でリンクを押しても、書き出しは始まりません。
            </p>
            <details className="rounded-lg bg-[var(--soft)] p-3 text-sm leading-6">
              <summary className="cursor-pointer font-medium">
                スマートフォン・ドラッグできない場合
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--muted)]">
                <li>このページをブックマークに登録します。</li>
                <li>「登録用アドレスをコピー」を押します。</li>
                <li>
                  登録したブックマークの編集画面で、名前を「旧デッキ書き出し」にします。
                </li>
                <li>
                  同じ編集画面の「URL」欄を、コピーした全文に置き換えて保存します。
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
                    className="mt-1 h-24 w-full break-all rounded border bg-[var(--surface)] p-2 text-xs"
                  />
                </label>
              )}
              <p className="mt-2 text-xs text-[var(--muted)]">
                URLの先頭の「javascript:」も含めて保存してください。
              </p>
            </details>
          </li>
          <li className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <h2 className="font-medium">2. 旧サイトで書き出す</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">
              デッキを保存した端末・同じブラウザで行ってください。
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--muted)]">
              <li>普段のブックマークや履歴から旧サイトを開きます。</li>
              <li>
                旧サイトを表示したまま、手順1で登録した書き出し用ブックマークを選びます。
              </li>
              <li>
                書き出し完了のメッセージと、保存されたデータファイル（JSON）を確認します。
              </li>
            </ol>
            <details className="rounded-lg bg-[var(--soft)] p-3 text-sm leading-6">
              <summary className="cursor-pointer font-medium">
                スマートフォンのChromeで動かない場合
              </summary>
              <p className="mt-2 text-[var(--muted)]">
                旧サイトを表示したまま、ブラウザ上部のアドレス欄に「旧デッキ書き出し」と入力し、候補のブックマークを選びます。
              </p>
            </details>
          </li>
          <li className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <h2 className="font-medium">3. 新サイトで取り込む</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--muted)]">
              <li>
                この案内画面に戻り、下の「旧サイトのJSONファイルを選ぶ」から書き出したファイルを選びます。
              </li>
              <li>
                確認画面では全件選択済みです。取り込まないデッキだけチェックを外します。
              </li>
              <li>「○件をインポート」を押します。</li>
              <li>「マイデッキ」で追加されたことを確認します。</li>
            </ol>
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
