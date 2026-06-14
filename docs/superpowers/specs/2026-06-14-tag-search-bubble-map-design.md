# 設計：Tag Search（バブルマップ）導入とタグ UI の刷新

- 日付: 2026-06-14
- 対象リポジトリ: kynantokoro-com（pnpm monorepo / React Router v7 on Cloudflare Workers / Sanity CMS）
- ステータス: ドラフト（**承認待ち**）
- 関連: `docs/superpowers/specs/2026-06-14-tech-blog-simplification-design.md`（タグ中心化の先行設計）

## 背景

先行のタグ中心化により、ホームに「タグフィルタ列」、`/tags` に「プレーンなタグ索引」、`tags.json`（機械可読）を備えた。次段として、タグ閲覧体験を一新する。

ビジョンは「タグを**地図のように探索**できる」こと：

> タグがバブルとして 2D 空間に散らばり、件数が多いタグは大きく、ジャンルが近いタグは互いに近くに集まる。バブルをクリックすると、そのタグの記事（タイトル＋要約）が大きなバブルへトランジション展開する。ズーム/パンで全体↔詳細を行き来できる。

同時に、視覚に依存しない**バブルなしのプレーン一覧**も常設し、アクセシビリティと非 JS フォールバックを担保する。

## 確定した設計判断（本タスクの前提）

1. **近接（クラスタリング）の基準＝意味的類似を、CI で Claude（Anthropic API）により事前計算**。
   - 厳密な embeddings エンドポイントは Anthropic に無いため、**Claude（messages）にタグ集合を渡し、セマンティックなクラスタ分割を JSON で直接出力**させる方式を採る（実効として「ジャンルが近い＝近接」を満たす）。
   - **タグ名の集合＋総数の hash が変化した時だけ**再生成する。生成物（レイアウト JSON）はリポジトリにコミットし、ランタイムは静的読み込みのみ（毎リクエスト AI 呼び出しはしない）。
   - 実行は **GitHub Actions**（定期＋手動＋任意で Sanity Webhook 起動）。
2. **ルートは `/:lang/tags` に集約し、Bubbles / List の表示切替**を持たせる。
   - SSR は常に **List（プレーン一覧）** を出力（＝非 JS / 支援技術のフォールバック）。JS 有効時に Bubbles へ拡張。
   - ホームの「Tag Search」リンクは `/:lang/tags` を指す。新ルートは増やさない。
3. **バブルの物理演算は `d3-force` + `d3-zoom`、描画は SVG**。タグ数規模（〜数十）に最適で、クリック展開トランジションも作りやすい。

## ゴール

1. ホームからタグフィルタ列を撤去し、同位置に「Tag Search」リンク 1 個のみを置く（記事一覧は全件のまま）。
2. EntryCard のタグ表示を撤去（非表示）。
3. `/:lang/tags` を「Tag Search」画面に刷新：ズーム/パン可能なバブルマップ＋プレーン一覧の切替、バブルクリックで記事一覧へトランジション展開。
4. ジャンル近接を CI（Claude）で事前計算し、hash 変化時のみ再生成・コミットする仕組みを構築。
5. アクセシビリティ（プレーン一覧常設、キーボード操作、reduced-motion 対応）を満たす。

## スコープ

### A. ホーム（`packages/website/app/routes/home.tsx`）

- タグフィルタ列（ボタン群）・`selectedTag` 状態・`?tag=` 同期・絞り込みロジックを撤去。記事一覧は**常に全件**表示。
- フィルタ列があった位置に、**「Tag Search」リンク 1 個**（`/${lang}/tags` へ）を配置。ラベル: EN `Tag Search` / JA `タグサーチ`。
- `meta()` の `Blog` JSON-LD（`blogLd`）は維持（全記事から生成）。loader も記事取得を維持（一覧＋ JSON-LD に必要）。
- 不要になった import（`useState`/`useEffect`/`useSearchParams`/`uniqueTags`）を整理。

### B. EntryCard（`packages/website/app/components/EntryCard.tsx`）

- タグ表示ブロック（`tags.slice(0,3)` の `<span>` 群）を削除。`tags` prop も撤去。
- ホーム側の `<EntryCard ... tags={...}/>` から `tags` を除去。
- カードのレイアウト（画像／タイトル／日付）は維持。

### C. Tag Search ＝ `/:lang/tags`（`packages/website/app/routes/tags.tsx`）

- **loader**: 全記事取得 → `aggregateTags`（既存）で `grouped` を生成。加えて**コミット済みレイアウト成果物**（`app/data/tag-layout.json`）を読み込み、`grouped` と共に返す。
- **SSR/List ビュー（フォールバック）**: 現行のプレーン一覧（タグ＋件数、配下に記事タイトル・要約・記事リンク）を踏襲。ただし各タグの遷移先は**ホーム `?tag=` を廃止**し、同一ページ内アンカー／展開に変更。記事リンクは従来どおり `/${lang}/entry/${slug}`。
- **表示切替**: `Bubbles` / `List` トグル。JS ハイドレート時の既定は `Bubbles`、`List` は常時選択可。状態は URL（`?view=list`）に同期し共有可能に。
- **Bubbles ビュー（クライアント専用・プログレッシブ強化）**:
  - `app/components/tag-search/TagBubbleMap.tsx`（client-only、動的 import で遅延ロード）。
  - 入力: `grouped`（件数）＋ レイアウト成果物（クラスタ割当）。
  - `d3-force`: `forceCollide`（半径＝件数のスケール）／`forceManyBody`（反発）／`forceX/forceY`（所属クラスタの重心へ引力）でジャンル領域を形成。`d3-zoom` でパン/ズーム。SVG 描画。
  - バブルサイズ ∝ 記事件数。各バブルは `tag` ラベル＋件数を表示。
  - **クリック展開**: バブル → そのタグの記事（タイトル＋要約）を**大きなバブル/オーバーレイ**へトランジション表示（`role="dialog"`、フォーカストラップ、ESC で閉じる）。記事は `/${lang}/entry/${slug}` へ。
  - 決定的レイアウト: 成果物のクラスタ順から重心を円周配置し、シード位置を固定 → 再読み込みでも安定。
- **headers**: 既存どおり `Cache-Control: public, max-age=60, stale-while-revalidate=3600`。

### D. セマンティックレイアウト成果物＋生成パイプライン

- **成果物**: `packages/website/app/data/tag-layout.json`（git 管理）。
  ```jsonc
  {
    "hash": "<sha256: ソート済みユニークtag名 + '|' + ユニークtag数>",
    "generatedAt": "2026-06-14T00:00:00Z",
    "model": "claude-sonnet-4-6",
    "clusters": [
      { "id": "graphics", "name": { "en": "Graphics & Rendering", "ja": "グラフィックス" },
        "tags": ["webgl2", "sokol", "wasm"] }
      // ...
    ]
  }
  ```
  - **件数（バブルサイズ）は成果物に含めない**。件数はランタイムで生データ（`aggregateTags`）から算出。Claude が担うのは「意味的グルーピング」のみ。
- **生成スクリプト**: `packages/website/scripts/generate-tag-layout.ts`
  1. Sanity から現行タグを取得（`createSanityClient` 流用 → `uniqueTags`）。
  2. `hash = sha256(sortedUniqueTags.join('\n') + '|' + count)` を計算。
  3. コミット済み `tag-layout.json` の `hash` と一致 → **何もせず終了**（差分なし）。
  4. 不一致 → **Anthropic Messages API（`@anthropic-ai/sdk`、既存依存）** を呼び、タグ配列からクラスタ分割 JSON を取得（低温度、出力スキーマを厳格指定）。
  5. `zod`（既存依存）で検証。全タグが**いずれかのクラスタに過不足なく**含まれることを保証（欠落タグは `other` クラスタへ補完）。
  6. 新 `hash`/`generatedAt`/`model` 付きで成果物を書き出し。
  - 既定モデル: `claude-sonnet-4-6`（環境変数で上書き可）。実行は稀のためコスト/レイテンシは非問題。
- **GitHub Actions**: `.github/workflows/tag-layout.yml`
  - トリガ: `workflow_dispatch`（手動）＋ `schedule`（例: 日次 cron）＋ 任意で `repository_dispatch`（Sanity Webhook → `sanity-content-changed`）。
  - 手順: 既存ワークフロー準拠（GitHub App トークン発行 → checkout → Node 22 → pnpm setup＋cache → `pnpm install` → `pnpm --filter website exec tsx scripts/generate-tag-layout.ts`）。
  - 成果物に差分があれば**自動コミット&push**（App トークンで contents:write）。差分なしなら no-op。
  - 必要シークレット: `SANITY_PROJECT_ID` / `SANITY_DATASET` / `SANITY_TOKEN`（read）/ `ANTHROPIC_API_KEY`。`concurrency` で多重実行抑止。

### E. 純粋ロジック＋型（`packages/website/app/lib/tagLayout.ts`、TDD）

- `computeTagSetHash(tags: string[]): string`（ソート/重複排除→ hash。決定的）。
- `parseTagLayout(json): TagLayout`（`zod` 検証。不正は例外）。
- `buildBubbleNodes(grouped, layout, options): BubbleNode[]`
  - `radius = radiusScale(count)`（例: sqrt スケール、min/max クランプ）。
  - 各タグに `clusterId`/`clusterIndex` を付与。**成果物に無いタグは `other` クラスタへ**フォールバック（新タグ追加直後で CI 未実行でも破綻しない）。
- `clusterCentroids(clusterCount, size): {x,y}[]`（円周等分配置、決定的）。
- これらは副作用なし＝ vitest で単体テスト。`d3-force`/SVG の動的挙動は対象外（純関数のみ検証）。

### F. 依存追加

- ランタイム: `d3-force` / `d3-zoom` / `d3-selection` / `d3-scale`（＋ `@types/d3-*`）。バブルコンポーネントは動的 import で分割し、List/SSR 経路には載せない。
- 既存利用: `@anthropic-ai/sdk`（生成スクリプト）、`zod`（検証）。

## スコープ外

- 毎リクエストの AI 呼び出し（成果物方式で回避）。
- 複数タグ AND/OR 検索、タグ名のテキスト検索ボックス（将来の任意拡張として spec 末尾に記載のみ）。
- entry スキーマ変更（`summary` は既存）。先行タスクのデータ移行は別管理。
- WebGL/Canvas 描画（SVG で足りる規模）。
- タグの多言語正規化（タグ値は言語共通文字列として扱う既存方針を踏襲）。

## アーキテクチャ / ファイル変更一覧

変更:
- `packages/website/app/routes/home.tsx`（フィルタ撤去 → Tag Search リンク）
- `packages/website/app/components/EntryCard.tsx`（タグ表示・prop 撤去）
- `packages/website/app/routes/tags.tsx`（List＋Bubbles 切替、loader でレイアウト読込）
- `packages/website/package.json`（d3 系依存追加）
- （`routes.ts` は変更不要：`/tags` 既存に集約）

新規:
- `packages/website/app/lib/tagLayout.ts` ＋ `tagLayout.test.ts`
- `packages/website/app/components/tag-search/TagBubbleMap.tsx`（client-only）
- `packages/website/app/components/tag-search/TagEntriesOverlay.tsx`（展開ダイアログ）
- `packages/website/app/data/tag-layout.json`（CI 生成・初期は手動 or 初回実行でコミット）
- `packages/website/scripts/generate-tag-layout.ts`
- `.github/workflows/tag-layout.yml`

## データフロー

- **ホーム**: loader が全記事取得 → 一覧表示（フィルタなし）＋ `blogLd`。タグ探索は「Tag Search」リンクで `/tags` へ委譲。
- **/tags（List）**: 全記事 → `aggregateTags` → SSR 一覧（フォールバック）。
- **/tags（Bubbles）**: `grouped`（件数）＋ `tag-layout.json`（クラスタ）→ `buildBubbleNodes` → `d3-force` で配置 → SVG。クリックで `grouped[tag].entries` をオーバーレイ展開。
- **レイアウト生成（CI）**: Sanity → `uniqueTags` → hash 比較 → 変化時のみ Claude → 検証 → `tag-layout.json` 更新 → 自動コミット。

## i18n

- タグ値は言語共通。バブルラベルはタグ文字列をそのまま表示。
- クラスタ名は Claude が `{en, ja}` で返し、領域ラベル表示時は現在言語を使用（未使用でも可）。
- 記事タイトル/要約は現在言語で表示（既存パターン）。
- 「Tag Search」リンク・トグル文言は EN/JA を用意。

## アクセシビリティ

- **プレーン一覧を常時 SSR**：非 JS / スクリーンリーダーはこれが基本ビュー。
- バブルは**実フォーカス可能な要素**（`<button>` 等）にし、`aria-label="<tag>（<count>件）"`。Tab 巡回可能。
- 展開オーバーレイは `role="dialog"` ＋ フォーカストラップ ＋ ESC クローズ ＋ 復帰フォーカス。
- `prefers-reduced-motion` で物理アニメ/トランジションを抑制（即時配置・フェードのみ）。
- ズーム/パンはキーボードでも操作可能な代替（List ビュー）を保証。

## パフォーマンス / 非機能

- バブルコンポーネントは動的 import で分割。d3 はサブモジュール単位で取り込み軽量化。
- レイアウトは静的 JSON 取り込み → ランタイム AI 呼び出しゼロ。シード固定で再現性確保。
- 生データから件数算出のため、**タグ集合不変なら新規記事追加でも CI 再実行不要**（バブルサイズのみランタイム更新）。
- `Cache-Control` は既存ルート基準を踏襲。

## テスト方針（TDD）

- 単体（`tagLayout.test.ts`）:
  - `computeTagSetHash`: 並び替え/重複に対する安定性、集合変化での hash 変化。
  - `parseTagLayout`: 正常 JSON 受理 / 不正・タグ欠落の検出。
  - `buildBubbleNodes`: 件数→半径スケール、クラスタ割当、未知タグの `other` フォールバック。
  - `clusterCentroids`: 個数に対する決定的配置。
- 既存の `tags.ts`（集計）テストは流用。
- ルート/コンポーネントの動的挙動（d3/SVG/トグル）は、純関数抽出でカバーしつつ手動確認（dev サーバ＋実データ）で補完。
- 生成スクリプトは純粋部（hash/検証/補完）をテスト、ネットワーク/AI 呼び出しは薄いシェルに隔離。

## 想定リスクと緩和

- **Anthropic に embeddings 無し** → Claude(messages) でクラスタ JSON を直接生成。出力は非決定的になりうる → 低温度＋厳格スキーマ＋ `zod` 検証＋ hash 変化時のみ再生成（集合不変なら固定）＋成果物を PR 差分でレビュー可能。
- **Claude 出力の不正/タグ欠落** → 検証で弾き、欠落は `other` クラスタへ補完。最低限マップは常に成立。
- **ランタイム時に成果物が古い（新タグ未反映）** → `buildBubbleNodes` が未知タグを `other` へ。破綻しない。
- **d3 によるバンドル増** → 動的 import＋サブモジュール。SSR/List は無依存。
- **SSR/ハイドレーション** → Bubbles は client-only。マウント後に物理演算開始。
- **アニメの a11y 影響** → reduced-motion＋List フォールバック。
- **CI の自動コミット権限** → 既存の GitHub App トークン方式を流用（最小権限 contents:write）。

## 実装タスク（概要）※承認後に task-by-task 計画へ展開

1. d3 依存追加（`package.json` / lockfile）＋ vitest 既存環境確認。
2. `lib/tagLayout.ts`（hash / parse / nodes / centroids）を TDD で実装。
3. `scripts/generate-tag-layout.ts`（Sanity 取得 → hash 比較 → Claude → 検証 → 書出し）。
4. `app/data/tag-layout.json` 初版生成（ローカル実行 or 初回 CI）。
5. `.github/workflows/tag-layout.yml`（手動＋定期＋任意 webhook、差分時コミット）。
6. `components/tag-search/TagBubbleMap.tsx` ＋ `TagEntriesOverlay.tsx`（d3-force/zoom、SVG、展開）。
7. `routes/tags.tsx` を List/Bubbles 切替へ刷新（loader でレイアウト読込、`?view=` 同期、`?tag=` 廃止）。
8. `home.tsx` のフィルタ撤去＋「Tag Search」リンク化。
9. `EntryCard.tsx` のタグ撤去＋ホーム呼び出し更新。
10. 型チェック・ビルド・実データ動作確認（dev＋curl/手動）。
11. 任意拡張メモ（タグ名検索ボックス、領域ラベル表示）。

## 承認後の流れ

本設計を承認いただいた後、`docs/superpowers/plans/2026-06-14-tag-search-bubble-map.md` に**ステップ単位（チェックボックス）の実装計画**を起こし、Task 1 から実装に入る。

## 将来の任意拡張（今回は実装しない）

- バブルマップ上のタグ名インクリメンタル検索（ハイライト/フォーカス移動）。
- クラスタ領域ラベルの常時表示（ジャンル名のフローティング）。
- Sanity Webhook 連携の正式化（`repository_dispatch` 起動）。
