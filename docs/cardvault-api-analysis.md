# CardVault API 調査メモ（2026-03-07）

## 調査方法
- Chrome DevTools MCP で `https://cardvault.fabtcg.com/` を操作。
- 検索（`Awakening`）→ 結果一覧 → カード詳細（英語/日本語切替）の通信を確認。
- 追加で API に直接 `curl` し、レスポンス構造を確認。

## 確認できた API エンドポイント

| 用途 | メソッド/URL | 補足 |
| --- | --- | --- |
| カード検索 | `GET https://api.cardvault.fabtcg.com/carddb/api/v1/advanced-search/?q=<query>&page_size=60&orderby=name` | 一覧画面で使用。`advanced-search`（末尾 `/` なし）へアクセスすると `301`。 |
| カード詳細（カード単位） | `GET https://api.cardvault.fabtcg.com/carddb/api/v1/card_id/<card_id>/` | 詳細画面で使用。`card_prints` に印刷違い・言語違いがまとまって返る。 |
| 製品一覧（Products） | `GET https://api.cardvault.fabtcg.com/carddb/api/v1/product-groups-products/?page=<n>` | `/products` 画面で使用。初回はクエリなし、続きは `page` でページング。 |
| ランディング画像 | `GET https://api.cardvault.fabtcg.com/carddb/api/v1/splash-image/` | ホーム表示用。MCP ツールでは未使用。 |
| API ルート | `GET https://api.cardvault.fabtcg.com/carddb/api/v1/` | 一部公開エンドポイント一覧を返す。 |

## 旧実装との差分（MCP への影響）

| 既存実装 | 旧依存先 | 変更後の考え方 |
| --- | --- | --- |
| `search_fab_cards` | `cards.fabtcg.com/api/search/v1/cards/` | `advanced-search` に置換。 |
| `get_fab_card_prints` | `cards.fabtcg.com/api/fab/v1/prints/` | `card_id/<card_id>/` の `card_prints` を利用。 |
| `get_card_detail` | `cards.fabtcg.com/card/...` の HTML スクレイピング | `card_id/<card_id>/` の JSON を直接利用（スクレイピング廃止）。 |
| `get_fab_products` | なし（新規） | `product-groups-products/` を利用し、Products 画面相当の一覧を返す。 |

### 重要なフィールド差分
- 旧 `search` の `display_name` / `url` は新 API にはない。
- 新 `advanced-search` は `printed_*` 系フィールドと `faces[].image` を返す。
- 新 `card_id` は `card_prints[]` 配下に `print_id`、`print_language`、`faces[]`（`face_id`, `finish_type`, `image`, `printed_rules_text` など）を返す。
- 旧 HTML スクレイピングで抽出していた「言語別テキスト」「バリエーション」「legality」は新 JSON で取得可能。

## 既存ツールを同等機能で維持するための変更方針

### 1. `search_fab_cards`
- 呼び先を `advanced-search` に変更。
- 既存レスポンス型へのマッピング:
  - `id` <- `card_id`
  - `name` <- `printed_name`
  - `displayName` <- `printed_name`（代替）
  - `cardUrl` <- `https://cardvault.fabtcg.com/card/${card_id}/${print_id}`
  - `imageUrl` <- `faces[0].image.normal`
  - `pitch/cost/power/defense/text/typebox` <- `printed_*`
- `q` はそのまま渡し、既存と同様に部分一致検索を維持。

### 2. `get_fab_card_prints`
- 呼び先を `card_id/<card_id>/` に変更。
- `results[0].card_prints` を列挙して既存 `CardPrint` にマッピング。
- `finishTypes` は `faces[].finish_type` をユニーク化して生成。
- 画像は基本 `faces[0].image` を使用（複数 face を持つカードは将来拡張余地あり）。

### 3. `get_card_detail`
- HTML 取得/`cheerio` パースを完全撤廃し、`card_id/<card_id>/` の JSON を使用。
- `printId` 指定時:
  - `card_print.print_id === printId` を優先。
  - 未一致時は `faces[].face_id === printId` をフォールバック。
- `printId` 未指定時:
  - `is_default === true` を優先、なければ先頭印刷を採用。
- `en/ja` フィールド:
  - 採用した印刷、または全印刷から `face_language` を見て抽出。
- `variants`:
  - `card_prints` から `printId/language/setName/finishType/url` を生成。
- `set/rarity/artist`:
  - 採用印刷の `print_set` と `faces` から組み立て。

## 実装時の注意点
- 旧 API では存在したが新 API にない値（`display_name` など）は互換のために代替値で埋める。
- `card_id/<card_id>/` が `200 + results: []` を返すケースがあるため、空配列を明示的にハンドリングする。
- `advanced-search` のレスポンスは印刷単位寄りなので、必要に応じて同一 `card_id` の重複を許容/抑制する方針を実装前に決める。
- `product-groups-products` はページング (`page`) を返す。`page` が範囲外だと `404 {"detail":"Invalid page."}` になるため、呼び出し側でのハンドリングが必要。
- 実装後は `cheerio` の依存削除可否を確認する。

## 実装後の検証項目（予定）
- `yarn format`
- `yarn lint:fix`
- `yarn dev` で MCP ツールを手動確認
  - `search_fab_cards` で既知クエリ検索
  - `get_fab_card_prints` で多言語カードを検証
  - `get_card_detail` で `printId` 指定/未指定の両方を検証

## 実装反映メモ（2026-03-07）
- `src/index.ts` の 3 ツールを新 API へ移行済み。
  - `search_fab_cards` -> `advanced-search/`
  - `get_fab_card_prints` -> `card_id/<card_id>/` の `card_prints`
  - `get_card_detail` -> `card_id/<card_id>/` JSON から詳細を構築
- `get_fab_products` を追加。
  - `product-groups-products/` を呼び、`page` 付きページング情報と製品グループ一覧を返す
- `get_card_detail` の HTML スクレイピング（`cheerio`）はコード上で撤廃済み。

## 実装後の検証結果（このブランチ）
- `yarn tsc --noEmit`: 成功
- `yarn dev`: 成功（`http://localhost:8787` で起動確認）
- `yarn format`: 失敗（`command not found: biome`）
- `yarn lint:fix`: 失敗（`command not found: biome`）
