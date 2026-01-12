#!/bin/bash
set -e

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_DIR="$SCRIPT_DIR/../../packages/projects"
CACHE_MANIFEST="$SCRIPT_DIR/project-hashes.json"

# スクリプトディレクトリを作成（存在しない場合）
mkdir -p "$SCRIPT_DIR"

# プロジェクトハッシュを計算する関数
calculate_project_hash() {
  local project_path=$1
  # ビルド出力、キャッシュ、一時ファイルを除く全ファイルのハッシュを計算
  find "$project_path" -type f \
    ! -path "*/dist/*" \
    ! -path "*/node_modules/*" \
    ! -path "*/.git/*" \
    ! -path "*/.cache/*" \
    ! -name ".DS_Store" \
    ! -name "*.log" \
    ! -name "compile_commands.json" \
    -exec sha256sum {} \; | sort | sha256sum | cut -d' ' -f1
}

# 前回のハッシュマニフェストを読み込む（なければ空のオブジェクト）
if [ -f "$CACHE_MANIFEST" ]; then
  PREVIOUS_HASHES=$(cat "$CACHE_MANIFEST")
else
  PREVIOUS_HASHES="{}"
fi

# 新しいハッシュマニフェスト
NEW_HASHES="{}"

# ビルドが必要なプロジェクトのカウンター
BUILT_COUNT=0
SKIPPED_COUNT=0

echo "🔍 Checking projects for changes..."
echo ""

# 各プロジェクトをチェック
for project_dir in "$PROJECTS_DIR"/*/; do
  if [ ! -d "$project_dir" ]; then
    continue
  fi

  project_name=$(basename "$project_dir")

  # lovejs-template をスキップ
  if [ "$project_name" = "lovejs-template" ]; then
    continue
  fi

  # package.json が存在するプロジェクトのみ処理
  if [ ! -f "$project_dir/package.json" ]; then
    continue
  fi

  # 現在のプロジェクトハッシュを計算
  current_hash=$(calculate_project_hash "$project_dir")

  # 前回のハッシュを取得
  previous_hash=$(echo "$PREVIOUS_HASHES" | jq -r --arg name "$project_name" '.[$name] // ""')

  # 新しいマニフェストに追加
  NEW_HASHES=$(echo "$NEW_HASHES" | jq --arg name "$project_name" --arg hash "$current_hash" '.[$name] = $hash')

  # ハッシュ比較
  if [ "$current_hash" = "$previous_hash" ] && [ -d "$project_dir/dist" ]; then
    echo "⏭️  Skipping $project_name (unchanged)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  else
    if [ "$current_hash" = "$previous_hash" ]; then
      echo "🔨 Building $project_name (no build output found)"
    else
      echo "🔨 Building $project_name (source changed)"
    fi

    # プロジェクトをビルド
    cd "$project_dir"
    pnpm build

    # ビルド出力をwebsiteにコピー
    if [ -d "dist" ]; then
      OUTPUT_DIR="$SCRIPT_DIR/../../packages/website/public/projects/$project_name"
      mkdir -p "$OUTPUT_DIR"
      echo "   Installing from dist/ to website/public/projects/$project_name"
      cp -r dist/* "$OUTPUT_DIR/"
    fi

    cd - > /dev/null

    BUILT_COUNT=$((BUILT_COUNT + 1))
  fi
done

# 新しいマニフェストを保存
echo "$NEW_HASHES" > "$CACHE_MANIFEST"

echo ""
echo "✅ Build complete!"
echo "   Built: $BUILT_COUNT projects"
echo "   Skipped: $SKIPPED_COUNT projects"
