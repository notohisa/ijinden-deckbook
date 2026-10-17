import { Button } from '@/components/ui/button';

export function Help({ onLegacyMigration }: { onLegacyMigration: () => void }) {
  return (
    <section
      className="mx-auto max-w-3xl break-words rounded-2xl border border-[var(--line)] bg-[var(--surface)]/80 p-5 text-[15px] leading-7 shadow-[0_12px_30px_rgb(33_38_45/0.04)] sm:p-7 sm:text-base"
      role="tabpanel"
      aria-label="ヘルプ"
    >
      <p className="label">HELP</p>
      <h1 className="mt-1 font-display text-2xl tracking-wide">
        イジンデン デッキ帳の使い方
      </h1>
      <p className="mt-3 text-[var(--muted)]">
        デッキを作り、保存・共有や一人回しができるツールです。
      </p>
      <p className="mt-2 rounded-lg bg-[var(--soft)] px-3 py-2 text-sm leading-6">
        ヘッダーの「表示テーマ」で、自動（端末の配色設定に連動）・ライト・ダークを選べます。
      </p>

      <div className="mt-6 space-y-8 text-[var(--muted)]">
        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide text-[var(--ink)]">
            まずはデッキを作って保存
          </h2>
          <ol className="list-decimal space-y-2 pl-5 marker:font-medium marker:text-[var(--red)]">
            <li>「カード」タブで使いたいカードを探します。</li>
            <li>
              カードの行にある「メイン」または「サイド」の「＋」で追加します。
            </li>
            <li>「レシピ」タブで枚数を確認し、デッキ名を入力します。</li>
            <li>「マイデッキに保存」を押します。</li>
          </ol>
          <p>
            作成途中でも保存できます。カードが0枚の場合や、同じ名前のデッキがある場合は保存できません。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide text-[var(--ink)]">
            カードを探す・枚数を調整する
          </h2>
          <ul className="list-disc space-y-2 pl-5 marker:text-[var(--red)]">
            <li>検索欄では、カード名・効果・特性・カード番号で探せます。</li>
            <li>
              「条件で絞り込む」を開くと、色・種類・レベルなどで絞れます。条件を戻すときは「リセット」を押します。
            </li>
            <li>
              「レシピ」でカードをタップすると、「＋」「−」で枚数を変えられます。「↓」「↑」ではメインとサイドの間を1枚ずつ移します。
            </li>
            <li>
              「レシピをクリア」で、作業中のカードとデッキ名を空にします。
            </li>
          </ul>
          <details className="rounded-lg bg-[var(--soft)] px-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-[var(--ink)]">
              ルールチェックの見方
            </summary>
            <div className="space-y-2 pb-3 text-sm leading-6">
              <p>
                レシピには「使用可能」「作成途中」「ルール違反」が表示されます。
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>メイン40枚以上、サイド10枚以下</li>
                <li>サイドがある場合、メインとの合計60枚以下</li>
                <li>
                  同名カードの枚数制限、各レギュレーションの封印・枚数制限
                </li>
              </ul>
              <p>
                ルール違反でも保存できます。大会に出るときは、その大会の最新ルールも確認してください。
              </p>
            </div>
          </details>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide text-[var(--ink)]">
            保存したデッキを開く・整理する
          </h2>
          <ol className="list-decimal space-y-2 pl-5 marker:font-medium marker:text-[var(--red)]">
            <li>「マイデッキ」タブでデッキを選び、レシピに読み込みます。</li>
            <li>
              カードを調整し、「マイデッキに保存」を押して上書き更新します（別のデッキとして複製する場合は「別のデッキとして保存」）。
            </li>
          </ol>
          <p>
            読み込んだレシピを編集しても、元のマイデッキは自動で更新されません。「マイデッキに保存」で元のデッキを更新し、「別のデッキとして保存」でコピーを作れます。
          </p>
          <p>
            一覧はデッキ名やカード名で検索できます。状態での絞り込み、並び替え、色ラベルも使えます。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide text-[var(--ink)]">
            一人回しを試す
          </h2>
          <ol className="list-decimal space-y-2 pl-5 marker:font-medium marker:text-[var(--red)]">
            <li>レシピのメインデッキに10枚以上入れます。</li>
            <li>「シミュ」タブを開き、「このレシピで開始」を押します。</li>
          </ol>
          <p>
            メインをシャッフルし、手札6枚・ガーディアン4枚を用意します。サイドは使いません。
          </p>
          <ul className="list-disc space-y-2 pl-5 marker:text-[var(--red)]">
            <li>
              簡易表示：伏せたカードをタップして公開し、引けるカードを確かめます。
            </li>
            <li>
              盤面表示：ドローやエリア間の移動を操作し、デッキの動きを試せます。
            </li>
          </ul>
          <p className="text-sm leading-6">
            効果・コストの支払い・勝敗は自動処理しません。ルールに合わせて手動で操作してください。
          </p>
          <details className="rounded-lg bg-[var(--soft)] px-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-[var(--ink)]">
              盤面表示での操作
            </summary>
            <ul className="list-disc space-y-2 pb-3 pl-5 text-sm leading-6">
              <li>
                カードを移動先へドラッグします。スマホでは長押ししてから動かします。
              </li>
              <li>空のエリアや、折りたたんだエリアの見出しにも移せます。</li>
              <li>
                カードをタップすると、移動・グレー化・装備などのメニューが開きます。
              </li>
              <li>
                手札の引き直しは1回だけです。ドローや盤面操作の前に行ってください。
              </li>
            </ul>
          </details>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide text-[var(--ink)]">
            Google Driveで自分の端末間を同期する
          </h2>
          <p>
            PCやスマートフォンなど複数の端末間で、保存済みマイデッキとゴミ箱を手動で同期できます。
          </p>
          <ol className="list-decimal space-y-2 pl-5 marker:font-medium marker:text-[var(--red)]">
            <li>
              元の端末で「Googleで接続」を押し、Googleアカウントに接続します（Google接続前のデッキを同期したい場合は、同期前に「端末のデッキを同期対象に追加」を押してコピーします）。
            </li>
            <li>
              元の端末で「同期内容を確認」を押し、保存済みデッキの一覧を確認して「この内容で同期」を押してGoogle
              Driveに保存します。
            </li>
            <li>
              受け取り側の端末でも同じGoogleアカウントに接続し、「同期内容を確認」から「この内容で同期」を押して端末に反映します。
            </li>
          </ol>
          <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-sm leading-6">
            Google接続前にこのブラウザで保存していたデッキを同期したい場合は、接続後に「端末のデッキを同期対象に追加」を押してください。元のデッキは残ったままアカウント用の一覧へコピーされ、コピー後は別々に管理されます。実際のGoogle
            Driveへの保存は、その後の手動同期で行われます（別端末で同期済みのデッキを受け取るだけならこの操作は不要です）。
          </p>
          <p>
            同期は自動ではなく手動です。また、作成中でマイデッキに未保存のレシピは同期されず、端末内のみに保持されます。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide text-[var(--ink)]">
            バックアップ・別の端末への移動
          </h2>
          <p>
            データは端末のブラウザ内に保存され、ブラウザのサイトデータを消すと端末内のデータが消えます。別の端末と共有したい場合は「Google
            Drive同期」を利用するか、定期的にファイルへバックアップしてください。
          </p>
          <h3 className="font-medium text-[var(--ink)]">ファイルに保存する</h3>
          <ol className="list-decimal space-y-2 pl-5 marker:font-medium marker:text-[var(--red)]">
            <li>残したいレシピを、先に「マイデッキに保存」します。</li>
            <li>
              画面上部の「エクスポート」（狭いスマホ画面では「↓」）を押します。
            </li>
          </ol>
          <p>
            全マイデッキが1つのJSONファイルになります。マイデッキに保存していないレシピは含まれません。
          </p>
          <h3 className="font-medium text-[var(--ink)]">
            ファイルから取り込む
          </h3>
          <ol className="list-decimal space-y-2 pl-5 marker:font-medium marker:text-[var(--red)]">
            <li>
              「インポート」→「JSONファイルを選ぶ」で保存したファイルを選びます。
            </li>
            <li>
              「新規」「更新」の表示を確認し、取り込まないデッキのチェックを外します。
            </li>
            <li>「○件をインポート」を押します。</li>
          </ol>
          <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-sm leading-6">
            このデッキ帳のJSONでは、同じIDのデッキを確認後に更新します。名前だけが同じ場合は番号を付けて別のデッキとして追加します。元の内容を残したい場合は、更新対象のチェックを外してください。
          </p>
          <p>
            別の端末へ移す場合は、保存したファイルをメールやクラウドなどで送り、新しい端末のデッキ帳で取り込みます。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide text-[var(--ink)]">
            デッキを共有する
          </h2>
          <p>
            「レシピ」の「共有リンクをコピー」を押し、コピーしたリンクを相手に送ります。
          </p>
          <p>
            受け取った人はリンクを開き、「マイデッキに取り込む」を押します。内容と「新規」「更新」を確認し、「1件をインポート」で保存します。
          </p>
          <details className="rounded-lg bg-[var(--soft)] px-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-[var(--ink)]">
              テキストで渡す・1件ずつ取り込む
            </summary>
            <div className="space-y-2 pb-3 text-sm leading-6">
              <p>旧サイトから1デッキずつ移す場合も、この方法が使えます。</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>渡す側のレシピで「テキストデータをコピー」を押します。</li>
                <li>
                  受け取る側の「インポート」を開き、「コピーしたテキスト」に貼り付けます。
                </li>
                <li>
                  必要ならデッキ名を入力し、「内容を確認する」を押します。
                </li>
                <li>
                  内容と「新規」「更新」を確認し、「1件をインポート」を押します。
                </li>
              </ol>
              <p>
                メイン・サイドの見出しを含めて、1デッキ分ずつ貼り付けてください。
              </p>
            </div>
          </details>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide text-[var(--ink)]">
            旧サイトからまとめて移行する
          </h2>
          <p>
            デッキを保存した端末・同じブラウザで行います。下のボタンから、準備・書き出し・取り込みの手順を確認してください。
          </p>
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal text-[var(--ink)]"
            onClick={onLegacyMigration}
          >
            旧サイトからまとめて移行
          </Button>
          <p className="text-sm leading-6">
            同じカード構成は省き、同名で構成が違うデッキは「旧#番号」を付けて追加します。旧サイトのデータは削除しません。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide text-[var(--ink)]">
            困ったときは
          </h2>
          <details className="rounded-lg bg-[var(--soft)] px-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-[var(--ink)]">
              カードや保存したデッキが見つからない
            </summary>
            <p className="pb-3 text-sm leading-6">
              カードは「条件で絞り込む」を開き、「リセット」で探し直します。マイデッキは検索欄と状態の絞り込みを確認してください。保存したときと同じ端末・ブラウザを使っているかも確認します。
            </p>
          </details>
          <details className="rounded-lg bg-[var(--soft)] px-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-[var(--ink)]">
              インポートできない
            </summary>
            <ul className="list-disc space-y-2 pb-3 pl-5 text-sm leading-6">
              <li>
                ファイル：このデッキ帳のエクスポートか、旧サイトの書き出し用ブックマークで保存したJSONを選びます。
              </li>
              <li>
                テキスト：メイン・サイドの見出しを含む全体を貼り、表示されたエラーの行や枚数を確認します。
              </li>
            </ul>
          </details>
          <details className="rounded-lg bg-[var(--soft)] px-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-[var(--ink)]">
              複数タブで編集し、自動保存が止まった
            </summary>
            <div className="space-y-2 pb-3 text-sm leading-6">
              <p>
                同時編集で内容が競合しています。表示された案内から選んでください。
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>手元の編集を残す：「このタブの内容を別名で保存」</li>
                <li>
                  もう一方の編集へ切り替える：「他のタブのレシピを読み込む」
                </li>
              </ul>
              <p>
                競合中に再読み込みしても、このタブの編集内容は復元されます。
              </p>
            </div>
          </details>
        </section>
      </div>
    </section>
  );
}
