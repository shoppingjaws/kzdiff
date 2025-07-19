# kzdiff - Kustomize Diff Tool 実装計画書

## 概要

`kzdiff`は、Kustomize構成において、デフォルトブランチと現在の変更を比較し、`kustomize build`の結果の差分を可視化するCLIツールです。

## テスト駆動開発アプローチ

### テストファースト戦略

kzdiffの開発は、テスト駆動開発（TDD）アプローチを採用します。まず期待される動作をテストとして定義し、その後実装を行います。

### テストディレクトリ構造

各テストケースでは以下のディレクトリ構造を使用します：

```
tmp/
└── <test-case-name>/
    ├── from/
    │   ├── git/        # デフォルトブランチのファイル
    │   └── result/     # from側のkustomize build結果
    └── to/
        └── result/     # to側（現在の変更）のkustomize build結果
```

**処理フロー:**
1. `tmp/<test-case>/from/git/`にデフォルトブランチのファイルを配置
2. `from/git/`でkustomize buildを実行し、結果を`from/result/`に保存
3. 現在の変更をワーキングディレクトリで適用
4. kustomize buildを実行し、結果を`to/result/`に保存
5. `from/result/`と`to/result/`の内容を比較
6. テスト完了後、tmpディレクトリをクリーンアップ

### テストシナリオ

#### 1. 基本的な差分検出テスト
```typescript
test("kzdiff should compare kustomize build results between default branch and current changes", async () => {
  // Given: mainブランチにbase/deployment.yaml (nginx:1.14, replicas: 1)
  // When: featureブランチで変更 (nginx:1.20, replicas: 2, 環境変数追加)
  // Then: kzdiffが両方のビルド結果の差分を検出できること
});
```

**検証ポイント:**
- mainブランチのビルド結果に`nginx:1.14`と`replicas: 1`が含まれる
- featureブランチのビルド結果に`nginx:1.20`と`replicas: 2`が含まれる
- 環境変数の追加が検出される

#### 2. オーバーレイ構成での差分検出テスト
```typescript
test("kzdiff should handle overlays correctly", async () => {
  // Given: base + overlays/production構成
  // When: productionオーバーレイのパッチを変更 (replicas: 3→5, リソース制限追加)
  // Then: オーバーレイディレクトリでのkzdiffが正しく動作すること
});
```

**検証ポイント:**
- オーバーレイを適用したビルド結果の差分が正しく検出される
- ベースの変更とオーバーレイの変更が両方反映される

#### 3. エラーハンドリングテスト
```typescript
test("kzdiff should handle errors gracefully", async () => {
  // Scenario 1: Kustomizeディレクトリではない場合
  // Scenario 2: Gitリポジトリではない場合
  // Then: 適切なエラーメッセージを表示すること
});
```

**検証ポイント:**
- kustomization.yamlが存在しない場合のエラー
- Gitリポジトリ外での実行時のエラー

### テスト環境のセットアップ

各テストでは以下の手順で環境を構築します：

1. **一時ディレクトリの作成**
   ```typescript
   beforeEach(async () => {
     testDir = await mkdtemp(join(tmpdir(), "kzdiff-test-"));
   });
   ```

2. **Gitリポジトリの初期化**
   ```typescript
   await Bun.$`cd ${testDir} && git init`.quiet();
   await Bun.$`cd ${testDir} && git config user.email "test@example.com"`.quiet();
   ```

3. **Kustomizeファイルの作成**
   - base/deployment.yaml
   - base/kustomization.yaml
   - overlays/production/kustomization.yaml (オーバーレイテスト用)

4. **ブランチ操作のシミュレーション**
   - mainブランチでの初期コミット
   - featureブランチでの変更
   - 各ブランチでのkustomize build実行

### 実装前のテスト定義の利点

1. **仕様の明確化**: テストを書くことで、kzdiffの期待される動作が明確になる
2. **エッジケースの発見**: テストシナリオを考えることで、考慮すべきエッジケースが見つかる
3. **リファクタリングの安全性**: テストがあることで、実装を安全にリファクタリングできる
4. **ドキュメントとしての役割**: テストが実際の使用例として機能する

## 実装計画

### フェーズ1: コア機能の実装

1. **テストの作成と実行**
   - `src/kzdiff.test.ts`の作成
   - 基本的な動作を定義するテストケース
   - `bun test`での実行確認

2. **最小限の実装**
   - テストをパスする最小限のkzdiff実装
   - Git操作とKustomizeビルドの基本機能

3. **リファクタリング**
   - コードの整理とモジュール化
   - エラーハンドリングの改善

### フェーズ2: CLI化

1. **CLIインターフェースのテスト作成**
   - コマンドライン引数のパース
   - ヘルプメッセージの表示

2. **CLI実装**
   - 実行可能なCLIツールとしてパッケージ化
   - エラーメッセージの改善

### フェーズ3: 機能拡張

1. **差分表示の改善**
   - 色付き出力
   - 構造化された差分表示

2. **パフォーマンス最適化**
   - ビルド結果のキャッシュ
   - 並列処理

## まとめ

テスト駆動開発アプローチにより、kzdiffの実装は以下の流れで進めます：

1. 期待される動作をテストとして定義
2. テストをパスする最小限の実装
3. リファクタリングによる品質向上
4. 新機能追加時も同様のサイクルを繰り返す

これにより、堅牢で保守性の高いツールを開発できます。