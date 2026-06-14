# 設計：weekly企画を廃しタグ中心のシンプルなテックブログ化（AX対応）

- 日付: 2026-06-14
- 対象リポジトリ: kynantokoro-com（pnpm monorepo / React Router v7 on Cloudflare Workers / Sanity CMS）
- ステータス: 承認済み（実装計画へ）

## 背景

当初 `entry` ドキュメントは「Weekly Project」と「Blog Post」の二種別で設計されていたが、weekly企画は実運用に至らなかった。種別の区別を廃止し、単一の「ブログ記事」に統一したシンプルなテックブログにする。

同時に、AIエージェントがサイトを調査しやすくする（AX = Agent Experience）。具体的なビジョンは次のとおり：

> エージェントが kynantokoro を訪れる → タグ分布が即座に分かる → タグごとにどんな内容があるか分かる → タグ軸で活動内容をリサーチできる

この「タグで活動を一覧」を、人間にもエージェントにも、かつ 2026 年現在で実際に効く形で成立させる。

### AX に関する裏取り（2026 Q1〜Q2 時点）

- **llms.txt は標準ではない**。コミュニティ慣習（llmstxt.org）に留まり、主要AI各社は本番で読む/優先すると公言していない。AIクローラーの /llms.txt 取得は実測で全AIボットトラフィックの約 0.1%。自動巡回での優先効果はほぼ無い（明示的にURLを渡された時のみ有効）。→ **今回は採用しない**。
- **Markdown 提供は本命**。`Accept: text/markdown` または `.md` URL でクリーンな Markdown を返すと、エージェントのトークン消費が 60〜85% 減。Cloudflare が 2026 年に「Markdown for Agents」を投入した領域で、本サイトは Cloudflare Workers 上のため相性が良い。→ **採用（自前実装）**。
- **JSON-LD 構造化データは実際に効く**。Google AI Overviews / Bing / Perplexity 等が依拠し、構造化データ付きページは AI Overviews 露出が約 2.3 倍。ただしページを素テキスト扱いする純 RAG には効かない（「必要だが十分でない」）。→ **採用**。

## ゴール

1. `entry` を単一の「ブログ記事」に統一（種別の概念を完全に除去）。
2. タグを人間・エージェント双方の第一級の軸にする。
3. 2026 年に実効性のある AX（.md 提供 / JSON-LD / タグ索引 / 要約）を備える。

## スコープ

### コア（ブログ化）

1. **Sanity スキーマ** (`packages/website-cms/schemaTypes/entry.ts`)
   - `entryType` フィールドを削除。
   - `week` フィールドを削除。
   - `summary`（`object { en: text, ja: text }`、任意）を追加。AX 出力の内容品質を担う土台。
   - `preview` を日付ベースの表示に変更（`Weekly Project Week N` / `Blog` の出し分けを撤去）。

2. **データ移行**（一回限りスクリプト `packages/website/scripts/migrate-remove-entrytype.ts`）
   - 全 `entry` ドキュメント（published / drafts 双方）から `entryType`・`week` を unset。
   - slug / title / 本文 / tags は維持。既存の weekly 3 件（`week-01`, `lovejs-webgl2`, `custom-webaudio-backend`）はそのままブログ記事になる。
   - `@sanity/client` + 書き込みトークンで実行。published と drafts の両 ID を対象にする。

3. **GROQ クエリ** (`packages/website/app/lib/sanity.ts`)
   - `allEntries` / `entryBySlug` から `entryType`・`week` を除去。
   - 両クエリに `summary` を追加。`tags` は引き続き取得。

4. **ホーム** (`packages/website/app/routes/home.tsx`)
   - 種別フィルタ（All / Weekly Project / Blog）を**タグフィルタ**に置換。
   - 単一選択、`?tag=<value>` で URL 同期（既存の `?filter=` の仕組みを踏襲）。ブラウザ戻る/共有に対応。
   - タグ集合は loader が返す記事から動的に導出（重複排除）。`All` ＋各タグのボタン列。
   - 記事が持つタグの分布が一目で分かる UI にする。

5. **EntryCard** (`packages/website/app/components/EntryCard.tsx`)
   - `week` / `contentType` props と「Week N」バッジを削除。
   - タグ表示は維持し、タグクリックでそのタグのフィルタへ遷移できるようにする。

6. **記事ページ** (`packages/website/app/routes/entry.$slug.tsx`)
   - `isWeeklyProject` 判定と「Week N」表示を削除。

### AX（2026 実効性順）

- **M. Markdown 提供（自前実装）**
  - 新ルート `(/:lang)/entry/:slug.md`（`routes/entry.$slug[.]md.tsx`）。`content[lang]` の PortableText を Markdown 化し `Content-Type: text/markdown` で返す。
  - 変換器 `packages/website/app/lib/portableTextToMarkdown.ts` を新規実装。block（見出し/段落/リスト）、image（`![alt](url)`）、gameEmbed / audioPlayer（リンクまたは注記で表現）に対応。可能なら既存の PortableText→Markdown ライブラリを利用、無ければカスタムシリアライザ。
  - 記事 HTML に `<link rel="alternate" type="text/markdown" href="...md">` を出し、エージェントを .md へ案内。
  - 先頭に簡易フロントマター（title / date / tags / summary）を付与。

- **D. JSON-LD 構造化データ**
  - `packages/website/app/lib/jsonLd.ts` を新規実装。
  - 記事ページ：`BlogPosting`（`headline`, `keywords`=tags, `datePublished`, `inLanguage`, `description`=summary）。
  - ホーム / タグページ：`Blog` ＋ `ItemList`。
  - `<script type="application/ld+json">` として出力。

- **B. タグ索引（人間向け）**
  - 新ルート `(/:lang)/tags`（`routes/tags.tsx`）。タグ＋件数の一覧、各タグ配下に記事（タイトル・日付・要約・リンク）。
  - 各タグからタグフィルタ済みホーム（`?tag=`）へ遷移。

- **F. tags.json（機械可読）**
  - 新ルート `/tags.json`（`routes/tags[.]json.tsx`）。言語中立で
    `{ tag: { count, entries: [{ slug, title: {en,ja}, date, summary: {en,ja} }] } }` を返す。
  - `Cache-Control` を付与。

### スコープ外

- A. llms.txt（自動効果が薄いため今回見送り）。
- G. robots.txt 整備（同上）。
- テスト/下書きデータの掃除（`test`, `*-only`, `title-test-*` 等）。任意・別タスク。
- 複数選択タグフィルタ（AND/OR）。記事数規模的に YAGNI。

## アーキテクチャ / ファイル変更一覧

変更:
- `packages/website-cms/schemaTypes/entry.ts`
- `packages/website/app/lib/sanity.ts`
- `packages/website/app/routes/home.tsx`
- `packages/website/app/components/EntryCard.tsx`
- `packages/website/app/routes/entry.$slug.tsx`
- `packages/website/app/routes.ts`（新ルート登録）

新規:
- `packages/website/app/lib/portableTextToMarkdown.ts`
- `packages/website/app/lib/jsonLd.ts`
- `packages/website/app/routes/entry.$slug[.]md.tsx`
- `packages/website/app/routes/tags.tsx`
- `packages/website/app/routes/tags[.]json.tsx`
- `packages/website/scripts/migrate-remove-entrytype.ts`（一回限り）

## データフロー

- **ホーム**: loader が全記事（`tags`, `summary` 込み）を取得 → コンポーネントでタグ集合を導出 → `?tag` で絞り込み表示。
- **.md**: slug で 1 件取得 → `content[lang]` を Markdown 化 → `text/markdown` 返却（slug 不在は 404）。
- **tags.json**: 全記事取得 → タグ別にグルーピング → JSON 返却（キャッシュヘッダ付き）。
- **tags ページ**: 全記事取得 → タグ別にグルーピング → HTML 表示（tags.json と同じ集計ロジックを共有）。

## i18n

- `.md` は言語別エンドポイント（`/en/entry/slug.md`, `/ja/entry/slug.md`）。
- JSON-LD の `inLanguage` はページ言語に合わせる。
- `tags.json` は言語中立。`title` / `summary` を `{en, ja}` で内包。タグ値は言語共通の文字列として扱う。
- タグ索引ページは現在の言語で記事タイトル/要約を表示。

## テスト方針（TDD）

- 単体:
  - `portableTextToMarkdown`: 各ブロック種別（見出し/段落/リスト/image/gameEmbed/audioPlayer）の変換。
  - タグ集計（グルーピング・件数・重複排除）。
  - `jsonLd`: BlogPosting / Blog+ItemList の生成。
  - summary フォールバック（無 → 本文先頭抜粋 or 空）の挙動。
- ルート:
  - `.md`: `Content-Type: text/markdown`、本文内容、不在 slug の 404。
  - `tags.json`: スキーマ形状、件数、キャッシュヘッダ。
  - タグフィルタ: `?tag=` の絞り込みと URL 同期。

## エラー処理 / 非機能

- `.md` の不在 slug は 404。
- `.md` / `tags.json` に `Cache-Control`（既存ルートに倣い `public, max-age=60, stale-while-revalidate=3600` を基準）。
- `summary` は任意。未設定でも全 AX 出力が安全に成立する（フォールバック）。
- 既存の published/drafts パースペクティブ切替（`SANITY_PERSPECTIVE`）の挙動は維持。

## 移行手順（運用）

1. スキーマ変更をデプロイ前に、移行スクリプトで全 entry の `entryType`/`week` を unset。
2. スキーマから両フィールドを削除（残存値は無害化済み）。
3. フロント側のクエリ/UI/新ルートを反映。
4. 動作確認後デプロイ。

## 想定リスク

- PortableText→Markdown のカスタム埋め込み（gameEmbed/audioPlayer）の表現は劣化しうる → リンク＋注記で最低限の意味を保つ。
- 移行スクリプトは破壊的（unset）→ dataset バックアップ（または drafts での dry-run）を先に行う。
