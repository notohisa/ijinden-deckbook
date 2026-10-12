import { Button } from '@/components/ui/button';

export function Help({ onLegacyMigration }: { onLegacyMigration: () => void }) {
  return (
    <section
      className="mx-auto max-w-3xl break-words rounded-2xl border border-[var(--line)] bg-white/80 p-5 text-[15px] leading-7 shadow-[0_12px_30px_rgb(33_38_45/0.04)] sm:p-7 sm:text-base"
      role="tabpanel"
      aria-label="ヘルプ"
    >
      <p className="label">HELP</p>
      <h1 className="mt-1 font-display text-2xl tracking-wide">
        イジンデン デッキ帳の使い方
      </h1>
      <div className="mt-6 space-y-8">
        <p className="text-[var(--muted)]">
          「イジンデン
          デッキ帳」は、イジンデンのデッキを作って保存したり、一人回しを試したりできるツールです。
          <br />
          作ったデッキは、いま使っている端末のブラウザにそのまま保存されます。
        </p>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">基本的な使い方</h2>
          <p className="text-[var(--muted)]">
            デッキを作るときは、だいたい次のような流れで進めるとスムーズです。
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-[var(--muted)] marker:font-medium marker:text-[var(--red)]">
            <li>「カード」タブで使いたいカードを探す</li>
            <li>メインデッキやサイドデッキに追加する</li>
            <li>「レシピ」タブで全体の枚数やルールを確認する</li>
            <li>デッキの名前を入力する</li>
            <li>「マイデッキに保存」を押す</li>
            <li>「シミュ」タブで一人回しを試す</li>
          </ol>
          <p className="text-[var(--muted)]">
            途中の状態でも保存できるので、まずは思いついたカードを入れておいて、あとからゆっくり調整してみてください。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            カードを探してデッキに入れる
          </h2>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">カードを探す</h3>
            <p className="text-[var(--muted)]">
              「カード」タブの検索欄から探せます。カード名だけでなく、効果のテキストや特性、カード番号などからも検索できます。
            </p>
            <p className="text-[var(--muted)]">
              もっと細かく探したいときは「条件で絞り込む」を開くと、色や種類、レベル、パワー、能力キーワードや効果の種類などを組み合わせて探せます。
            </p>
            <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-6 text-[var(--muted)]">
              ※ 探し直したいときは「リセット」を押すと元の状態に戻ります。
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">デッキに追加する</h3>
            <p className="text-[var(--muted)]">
              一覧からカードを選んで、メインやサイドに追加します。
              <br />
              いま何枚入っているかは、一覧やレシピ画面ですぐに確認できます。
            </p>
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            レシピの確認と調整
          </h2>
          <p className="text-[var(--muted)]">
            「レシピ」タブでは、いま作っているデッキ全体を確認できます。
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[var(--muted)] marker:text-[var(--red)]">
            <li>
              <strong className="font-medium text-[var(--ink)]">
                画面上の表示：
              </strong>
              メインやサイドの枚数、カードの種類ごとの枚数がひと目で分かります。
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                枚数の変更：
              </strong>
              カードをタップするとボタンが出て、枚数を増やしたり減らしたり、メインとサイドを入れ替えたりできます。カード以外の場所をタップするとボタンが隠れるので、邪魔になりません。
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                最初からやり直す：
              </strong>
              デッキを白紙に戻したいときは「レシピをクリア」を使ってください。
            </li>
          </ul>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            デッキのルールチェック
          </h2>
          <p className="text-[var(--muted)]">
            レシピ画面では、基本的なルールに合っているかを自動で確認してくれます。
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[var(--muted)] marker:text-[var(--red)]">
            <li>メインデッキが40枚以上あるか</li>
            <li>サイドデッキが10枚以下か</li>
            <li>合計で60枚以下か</li>
            <li>同名カードの枚数制限を超えていないか</li>
            <li>各レギュレーションの封印・枚数制限に違反していないか</li>
          </ul>
          <p className="text-[var(--muted)]">
            結果に合わせて「使用可能」「作成途中」「ルール違反」と表示されます。
          </p>
          <p className="text-[var(--muted)]">
            作成途中やルール違反のままでも保存はできるので、思いついたアイデアのメモとして残しておくこともできます。
          </p>
          <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-6 text-[var(--muted)]">
            ※
            大会やイベントに出る際は、そのイベントの最新ルールもあわせて確認してください。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            マイデッキの保存と管理
          </h2>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">保存する</h3>
            <p className="text-[var(--muted)]">
              レシピ画面の「マイデッキに保存」から保存できます。
            </p>
            <p className="text-[var(--muted)]">
              すでに同じ名前のデッキがあると上書き防止のため保存できないので、分かりやすい別の名前をつけてあげてください。
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">一覧で整理する</h3>
            <p className="text-[var(--muted)]">
              「マイデッキ」タブに保存したデッキが並びます。
            </p>
            <ul className="list-disc space-y-1 pl-5 text-[var(--muted)] marker:text-[var(--red)]">
              <li>デッキ名だけでなく、中に入っているカード名でも探せます。</li>
              <li>
                「使用可能」や「作成途中」などの状態で絞り込んだり、並び順を変えたりできます。
              </li>
              <li>
                好きな色ラベルをつけられるので、デッキの色や種類ごとに分けておくと整理しやすいです。
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">
              保存したデッキを手直しする
            </h3>
            <p className="text-[var(--muted)]">
              マイデッキからデッキを選ぶと、レシピに読み込まれます。
            </p>
            <p className="text-[var(--muted)]">
              作業用として読み込まれるため、カードを入れ替えてもマイデッキにある元のデータが勝手に書き換わることはありません。
            </p>
            <p className="text-[var(--muted)]">
              元のデータを残したまま別バージョンを作りたいときは、違う名前をつけて新しく保存してください。
            </p>
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            一人回し（シミュレーター）
          </h2>
          <p className="text-[var(--muted)]">
            「シミュ」タブを開くと、作ったデッキで一人回しのテストができます。
          </p>
          <p className="text-[var(--muted)]">
            スタートすると自動でシャッフルされて、初期手札6枚とガーディアン4枚がセットされます。
          </p>
          <p className="text-[var(--muted)]">
            引き直し（マリガン）やドローを試しながら、デッキの動きを確かめてみてください。
          </p>
          <p className="text-[var(--muted)]">
            用途に合わせて2つの表示方法を選べます。
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[var(--muted)] marker:text-[var(--red)]">
            <li>
              <strong className="font-medium text-[var(--ink)]">
                盤面表示：
              </strong>
              実際の対戦スペースに近い画面です。カードを移動先のエリアへドラッグ＆ドロップできます。スマートフォンではカードを長押ししてから動かしてください。空のエリアや折りたたんだ見出しにも移動できます。カードをタップして操作メニューを開く方法も使えます。カードをグレーにしたり、イジンに装備をつけたりする操作はメニューから行います。
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                簡易表示：
              </strong>
              スマートフォンなどで手軽にドローや手札の動きを確かめたいとき向けの、シンプルな画面です。
            </li>
          </ul>
          <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-6 text-[var(--muted)]">
            ※
            シミュレーターは一人回しをしやすくするための補助ツールです。効果の自動処理やコストの支払い、勝敗の判定などは行いませんので、実際のルールに合わせて手動で操作してください。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            データのバックアップについて
          </h2>
          <p className="text-[var(--muted)]">
            デッキデータは、いま使っている端末のブラウザ内に保存されています。
          </p>
          <p className="text-[var(--muted)]">
            複数のタブでレシピを編集して内容が競合した場合は、自動保存を止めてお知らせします。「このタブの内容を別名で保存」で手元の内容を残すか、「他のタブのレシピを読み込む」で最新の内容に切り替えてください。競合中に再読み込みしても、このタブの編集中の内容を復元します。
          </p>
          <p className="text-[var(--muted)]">
            会員登録をしてサーバーに保存する仕組みではないため、ブラウザのサイトデータを削除したり、端末やブラウザを変えたりすると、デッキが消えたり引き継がれなかったりします。
          </p>
          <p className="text-[var(--muted)]">
            消えてしまうのを防ぐために、定期的にバックアップを取っておくのがおすすめです。
          </p>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">
              バックアップを取る（エクスポート）
            </h3>
            <p className="text-[var(--muted)]">
              画面上の「エクスポート」を押すと、マイデッキのデータが入ったファイル（JSONファイル）が端末に保存されます。
            </p>
            <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-6 text-[var(--muted)]">
              ※
              作成中でまだマイデッキに保存していないレシピは含まれないので、必ずマイデッキに保存してから行ってください。
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">
              データを復元する・別の端末に移す（インポート）
            </h3>
            <p className="text-[var(--muted)]">
              画面上の「インポート」→「JSONファイルを選ぶ」から保存しておいたファイルを選ぶと、以前のデッキを読み込めます。
            </p>
            <p className="text-[var(--muted)]">
              必要なデッキだけを選んで取り込むことも、まとめて取り込むこともできます。
            </p>
            <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-6 text-[var(--muted)]">
              ※
              すでに同じ名前のデッキがある場合は、そのデッキが更新されます。インポート前の確認画面で「新規」または「更新」と表示されるので、内容を確認してから取り込んでください。
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">
              旧サイトからまとめて移行する
            </h3>
            <p className="text-[var(--muted)]">
              旧サイトで書き出し用ブックマークを実行し、全マイデッキを1つのJSONファイルに保存します。このデッキ帳でファイルを選ぶと、カード番号を変換してまとめて取り込めます。
            </p>
            <p className="text-[var(--muted)]">
              同じカード構成は省き、同名で内容が違うデッキには「旧#番号」を付けます。元のデータは残ります。デッキを保存している端末・ブラウザで書き出してください。
            </p>
            <Button
              variant="outline"
              className="h-auto min-h-11 whitespace-normal"
              onClick={onLegacyMigration}
            >
              旧サイトからまとめて移行
            </Button>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">
              元サイトからテキストで移行する
            </h3>
            <ol className="list-decimal space-y-1 pl-5 text-[var(--muted)] marker:font-medium marker:text-[var(--red)]">
              <li>元サイトのレシピで「テキストデータをコピー」を押す</li>
              <li>
                このデッキ帳の「インポート」を開き、「コピーしたテキスト」に貼り付ける
              </li>
              <li>必要ならデッキ名を入力し、「内容を確認する」を押す</li>
              <li>枚数を確認して「1件をインポート」を押す</li>
            </ol>
            <p className="text-[var(--muted)]">
              メインデッキとサイドデッキの見出しを含めて、1デッキ分ずつ貼り付けてください。
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">
              機種変更やパソコンへ移すとき
            </h3>
            <ol className="list-decimal space-y-1 pl-5 text-[var(--muted)] marker:font-medium marker:text-[var(--red)]">
              <li>いまの端末で「エクスポート」してファイルを保存する</li>
              <li>そのファイルをメールやクラウド等で新しい端末に送る</li>
              <li>
                新しい端末でデッキ帳を開き、「インポート」でそのファイルを選ぶ
              </li>
            </ol>
            <p className="text-[var(--muted)]">
              これで、新しい端末でも同じデッキが使えるようになります。
            </p>
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">困ったときは</h2>
          <ul className="space-y-3 text-[var(--muted)]">
            <li>
              <strong className="font-medium text-[var(--ink)]">
                カードが見つからない
              </strong>
              <p>
                前回の検索条件が残っていることがあります。「リセット」を押してもう一度探してみてください。
              </p>
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                保存したデッキが見当たらない
              </strong>
              <p>
                検索欄に文字が入っていないか、「作成途中」などの絞り込みになっていないか確認してください。
              </p>
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                インポートができない
              </strong>
              <p>
                ファイルの場合は、このデッキ帳のエクスポートか、旧サイトの書き出し用ブックマークで保存したJSONファイルを選んでください。テキストの場合は、メインデッキ・サイドデッキの見出しを含む全体を貼り付け、表示されたエラーの行や枚数を確認してください。
              </p>
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                一人回しが始まらない
              </strong>
              <p>
                レシピのメインデッキに10枚以上カードが入っているか確認してください。
              </p>
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}
