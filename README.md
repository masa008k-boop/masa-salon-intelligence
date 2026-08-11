# MASA Salon Intelligence

GitHub Pagesで公開するための静的Webアプリです。

## 公開手順
1. GitHubで新しいリポジトリを作成（例: `masa-salon-intelligence`）
2. このフォルダ内のファイルをすべてアップロード
3. GitHubの `Settings` → `Pages`
4. `Build and deployment` で `Deploy from a branch`
5. Branchを `main` / `/root` にして保存
6. 数分後に表示されるURLをiPhoneのSafariで開く

## 重要
- データはブラウザのlocalStorageに保存されます。
- 同じ端末・同じブラウザ・同じGitHub Pages URLなら、バージョンアップしても `STORAGE_KEY` を変えない限りデータを保持できます。
- GitHub Pages公開前のチャット内HTMLプレビューの試験データは引き継ぎません。
- 正式運用前に「バックアップ保存」でJSONを保存してください。

## 稼働率
分母: 出勤スタッフそれぞれの実勤務時間の合計
分子: 各時刻の顧客滞在人数を、その時刻の出勤スタッフ数を上限として合計
固定休憩は差し引きません。
