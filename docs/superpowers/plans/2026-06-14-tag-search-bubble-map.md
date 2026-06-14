# Tag Search バブルマップ 実装計画

> **For agentic workers:** タスク単位で TDD（純粋ロジック）→ 実装 → 検証 → コミット。チェックボックス（`- [ ]`）で進捗管理。

**Goal:** タグ閲覧を刷新する。ホームのタグフィルタ列を撤去し「Tag Search」リンク1個に、EntryCard のタグを非表示に、`/:lang/tags` を「List（a11yフォールバック）/ Bubbles（ズーム可能な2Dバブルマップ）」の切替画面へ。ジャンル近接は CI（Claude）が事前計算したクラスタ成果物 `tag-layout.json` に基づく。

**Source spec:** `docs/superpowers/specs/2026-06-14-tag-search-bubble-map-design.md`

**確定判断:** 意味的類似を CI の Claude(messages) で算出（hash 変化時のみ・成果物コミット）／`/tags` に集約＋表示切替／`d3-force`+`d3-zoom`・SVG。

**Working directory:** `packages/website` 特記なき限り。

---

## File Structure

新規:
- `app/lib/tagLayout.ts` ＋ `app/lib/tagLayout.test.ts`（純粋ロジック・TDD）
- `app/data/tag-layout.json`（CI 成果物。初期は手書きで投入）
- `app/components/tag-search/TagBubbleMap.tsx`（client-only、d3-force/zoom、SVG）
- `app/components/tag-search/TagEntriesOverlay.tsx`（展開ダイアログ）
- `scripts/generate-tag-layout.ts`（Sanity→hash 比較→Claude→検証→書出し）
- `.github/workflows/tag-layout.yml`

変更:
- `package.json`（d3 系依存）
- `app/routes/tags.tsx`（List/Bubbles 切替、loader でレイアウト読込、`?tag=` 廃止）
- `app/routes/home.tsx`（フィルタ撤去→Tag Search リンク）
- `app/components/EntryCard.tsx`（タグ撤去）

不変: `app/routes.ts`（`/tags` 既存に集約）。

---

## Task 1: d3 依存追加

- [ ] **Step 1:** `pnpm add d3-force d3-zoom d3-selection d3-scale`
- [ ] **Step 2:** `pnpm add -D @types/d3-force @types/d3-zoom @types/d3-selection @types/d3-scale`
- [ ] **Step 3:** `pnpm typecheck`（既存が緑のまま）
- [ ] **Step 4:** commit `chore: add d3-force/d3-zoom for tag bubble map`

---

## Task 2: `lib/tagLayout.ts`（TDD）

型:
```ts
export interface TagCluster { id: string; name?: { en?: string; ja?: string }; tags: string[]; }
export interface TagLayout { hash: string; generatedAt: string; model: string; clusters: TagCluster[]; }
export interface BubbleNode { tag: string; count: number; radius: number; clusterId: string; clusterIndex: number; x: number; y: number; }
```

関数（すべて副作用なし・runtime/worker 安全＝node:crypto 不使用）:
- `computeTagSetHash(tags: string[]): string` — 重複排除→ソート→`join('\n') + '|' + size` を **FNV-1a** で 8桁hex 化（変更検知用。暗号強度不要）。
- `parseTagLayout(data: unknown): TagLayout` — `zod` 検証。不正は throw。
- `radiusFor(count, maxCount, opts?={minR:18,maxR:60}): number` — `maxCount<=0→minR`、`minR+(maxR-minR)*sqrt(count/maxCount)`。
- `clusterCentroids(n, {width,height}): {x,y}[]` — 中心 `(w/2,h/2)`、半径 `min(w,h)*0.3`、角度 `2πi/n`。`n<=1` は中心1点。
- `buildBubbleNodes(grouped: Record<string,TagGroup>, layout, {width,height}): BubbleNode[]`
  - `tagToCluster`/`clusterIndex` を layout から構築。未知タグは `clusterId='other'`、index=`clusters.length`。
  - `radius=radiusFor(count,maxCount)`、シード `x,y` は所属クラスタ重心＋微小ジッタ（決定的：tag 文字列ハッシュでオフセット）。

- [ ] **Step 1:** `tagLayout.test.ts` を先に書く（hash 安定性/集合変化、parse 正常/不正/欠落、radiusFor 境界、clusterCentroids 決定性、buildBubbleNodes の未知タグ→other・半径・index）。
- [ ] **Step 2:** `pnpm test tagLayout`（FAIL を確認）
- [ ] **Step 3:** 実装
- [ ] **Step 4:** `pnpm test tagLayout`（PASS）
- [ ] **Step 5:** commit `feat: add tag layout helpers (hash, parse, bubble nodes)`

---

## Task 3: 生成スクリプト `scripts/generate-tag-layout.ts`

- 既存 `app/data/tag-layout.json` を読み（無ければ hash 未一致扱い）。
- Sanity から全 entry の `tags` を取得（`migrate` 同様にインライン `@sanity/client`、env: `SANITY_PROJECT_ID/DATASET/TOKEN`）→ `uniqueTags`。
- `computeTagSetHash` で比較。一致→ `console.log('no change')` exit 0。
- 不一致→ `@anthropic-ai/sdk` で Claude 呼び出し（既定 `process.env.TAG_LAYOUT_MODEL || 'claude-sonnet-4-6'`、`temperature:0`）。プロンプト: タグ配列を意味的に 4〜8 程度のクラスタへ**漏れ・重複なく**分割し、各クラスタに `id`（slug）/`name{en,ja}`/`tags[]` を持つ JSON のみ返す。
- レスポンスを JSON 抽出→ `zod` 検証→ 全タグ網羅チェック（欠落は `other` クラスタへ補完、重複は最初の所属を採用）。
- `{hash, generatedAt:new Date().toISOString(), model, clusters}` を `app/data/tag-layout.json` に整形書出し。

- [ ] **Step 1:** スクリプト実装（純粋部は Task 2 を import）
- [ ] **Step 2:** 構文/型確認 `pnpm exec tsc --noEmit scripts/generate-tag-layout.ts 2>&1 | grep generate-tag-layout || echo OK`（標準ライブラリ警告は許容、当該ファイルにエラーなし）
- [ ] **Step 3:** commit `feat: add CI script to generate semantic tag layout via Claude`

---

## Task 4: 初期 `app/data/tag-layout.json` 投入

ANTHROPIC 鍵が無いため初版は手書き（現行タグに対する妥当なクラスタ）。`hash` は実関数で算出して埋める。

- [ ] **Step 1:** 現行タグ集合に対するクラスタを著述（bilingual name 付き）。
- [ ] **Step 2:** `pnpm exec tsx -e "import {computeTagSetHash} from './app/lib/tagLayout'; console.log(computeTagSetHash([...tags]))"` で hash を算出し JSON に反映。
- [ ] **Step 3:** `parseTagLayout` を通す簡易チェック（`tsx -e`）。
- [ ] **Step 4:** commit `feat: add initial committed tag-layout.json`

---

## Task 5: GitHub Actions `.github/workflows/tag-layout.yml`

既存 `deploy-workers.yml` 準拠（GitHub App トークン、Node22、pnpm、cache）。

- トリガ: `workflow_dispatch` ＋ `schedule`（日次 cron）＋ `repository_dispatch:[sanity-content-changed]`。
- 手順: token→checkout(persist-credentials:false)→node22→pnpm setup＋store cache→`pnpm install`→`pnpm --filter website exec tsx scripts/generate-tag-layout.ts`→ 差分があれば commit&push。
- secrets: `SANITY_PROJECT_ID/SANITY_DATASET/SANITY_TOKEN/ANTHROPIC_API_KEY`。`concurrency` で多重抑止。`permissions: contents: write`（App トークン併用）。

- [ ] **Step 1:** ワークフロー作成
- [ ] **Step 2:** commit `ci: regenerate tag-layout.json when tag set changes`

---

## Task 6: バブル UI コンポーネント

`app/components/tag-search/TagBubbleMap.tsx`（client-only：全 d3 を `useEffect` 内で実行）:
- props: `{ nodes: BubbleNode[]; language: 'en'|'ja'; onSelect(tag): void }`。
- `<svg>` ＋ ズーム用 `<g>`。`d3-zoom` を svg に attach（scaleExtent 例 [0.3,4]）。
- `d3-force`: `forceCollide(d=>d.radius+2)`／`forceManyBody(-30)`／`forceX/forceY`（所属クラスタ重心へ、強さ 0.06）。tick で circle/label の transform 更新。
- 各バブル＝フォーカス可能（`<g role="button" tabindex=0 aria-label="<tag>（<count>件）">`）、Enter/Space/click で `onSelect`。
- `prefers-reduced-motion` 時はシミュレーションを即収束（`tick` 多数回→停止、トランジション無効）。

`app/components/tag-search/TagEntriesOverlay.tsx`:
- props: `{ tag; group: TagGroup; language; onClose() }`。
- `role="dialog" aria-modal aria-label`、フォーカストラップ、ESC/背景クリックで `onClose`、復帰フォーカス。
- 大きな円形/カードに、タグ名＋件数、記事（タイトル＋要約、`/${lang}/entry/${slug}` リンク）一覧。`motion-safe` で拡大フェード。

- [ ] **Step 1:** 両コンポーネント実装
- [ ] **Step 2:** （Task 7 後に）dev で表示確認
- [ ] **Step 3:** commit `feat: add tag bubble map and entries overlay components`

---

## Task 7: `routes/tags.tsx` 刷新

- import: `import tagLayoutData from '../data/tag-layout.json'`、`buildBubbleNodes/parseTagLayout`、`aggregateTags`。
- loader: 記事取得→`aggregateTags`→`grouped`。`parseTagLayout(tagLayoutData)`（try/catch で失敗時 `{clusters:[]}`）。return `{ grouped, layout }`。
- component:
  - `view` を `?view=` から（`list`|`bubbles`、既定 `bubbles`）。`mounted` フラグ（useEffect）で Bubbles はクライアントのみ描画、SSR/非JS は List。
  - トグル UI（Bubbles/List、`setSearchParams({view})`）。
  - List ビュー＝現行のプレーン一覧（タグ＋件数＋配下記事）。**タグ→ホーム`?tag=` リンクは廃止**し、同一ページ内（クリックで Overlay or アンカー）。記事リンクは維持。
  - Bubbles ビュー＝`buildBubbleNodes(grouped, layout, {width,height})`→ `React.lazy` で `TagBubbleMap` を遅延ロード（Suspense fallback）。`onSelect`→ `selectedTag` state→ `TagEntriesOverlay` 表示。
- [ ] **Step 1:** 実装
- [ ] **Step 2:** `pnpm typecheck`
- [ ] **Step 3:** dev＋実データで `/en/tags`（Bubbles 既定／`?view=list`／クリック展開／ズーム）確認
- [ ] **Step 4:** commit `feat: rework /tags into Tag Search (bubbles + list toggle)`

---

## Task 8: `home.tsx` フィルタ撤去→Tag Search リンク

- `selectedTag` state/effect、`uniqueTags`、タグフィルタ列、`setSearchParams` のタグ処理を撤去。記事一覧は全件。
- フィルタ位置に「Tag Search」リンク（`/${lang}/tags`、ラベル EN `Tag Search`/JA `タグサーチ`）。
- `meta()` の `blogLd` は維持。未使用 import 整理（`useState/useEffect/useSearchParams/uniqueTags`）。
- [ ] **Step 1:** 実装
- [ ] **Step 2:** `pnpm typecheck`
- [ ] **Step 3:** commit `feat: replace home tag filter with a Tag Search link`

---

## Task 9: `EntryCard.tsx` タグ撤去

- タグ表示ブロックと `tags` prop を撤去。`home.tsx` の `<EntryCard tags=...>` から `tags` を除去。
- [ ] **Step 1:** 実装
- [ ] **Step 2:** `pnpm typecheck`
- [ ] **Step 3:** commit `feat: hide tags on entry cards`

---

## Task 10: 総合検証

- [ ] **Step 1:** `pnpm test`（全 green）
- [ ] **Step 2:** `pnpm typecheck && pnpm build`
- [ ] **Step 3:** dev＋curl/手動で総合動作（ホームの Tag Search リンク、`/tags` の両ビュー、Overlay、ズーム/パン、reduced-motion、List フォールバック）
- [ ] **Step 4:** ブランチ push。PR は明示依頼時のみ。

---

## Self-Review

- 近接＝CI(Claude)算出のクラスタ → Task 3/4/5、ランタイムは静的読込（buildBubbleNodes）→ Task 2/7 ✓
- `/tags` 集約＋List/Bubbles 切替（List=a11yフォールバック）→ Task 7 ✓
- d3-force+d3-zoom/SVG → Task 6 ✓
- ホーム：フィルタ撤去＋Tag Search リンク → Task 8 ✓
- EntryCard：タグ非表示 → Task 9 ✓
- 未知タグ→other フォールバック（CI 未実行耐性）→ Task 2 ✓
- a11y（dialog/focus trap/ESC/reduced-motion/非JS List）→ Task 6/7 ✓
- 件数はランタイム算出（成果物に含めない）→ Task 2/7 ✓
- スコープ外：毎リクエスト AI／多選択／タグ検索ボックス／WebGL ✓
