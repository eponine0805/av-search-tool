document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const searchInput = document.getElementById('searchInput');
    const dmmSearchButton = document.getElementById('dmmSearchButton');
    const sokmilSearchButton = document.getElementById('sokmilSearchButton');
    const loader = document.getElementById('loader');
    const resultsContainer = document.getElementById('results');

    // --- イベントリスナーの設定 ---
    dmmSearchButton.addEventListener('click', () => performSearch('dmm'));
    sokmilSearchButton.addEventListener('click', () => performSearch('sokmil'));

    /**
     * サーバーに検索リクエストを送信し、結果を表示する
     * @param {string} searchType - 検索タイプ ('dmm' または 'sokmil')
     */
    const performSearch = async (searchType) => {
        const query = searchInput.value.trim();
        if (!query) {
            resultsContainer.innerHTML = '<p>検索したい内容を入力してください。</p>';
            return;
        }

        // UIを検索中状態に更新
        loader.style.display = 'block';
        resultsContainer.innerHTML = '';
        dmmSearchButton.disabled = true;
        sokmilSearchButton.disabled = true;

        try {
            const response = await fetch('/.netlify/functions/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userQuery: query, type: searchType }),
            });

            const data = await response.json();

            if (!response.ok) {
                // サーバーからのエラーメッセージがあればそれを表示
                throw new Error(data.error || `サーバーエラーが発生しました (Status: ${response.status})`);
            }

            displayResults(data);

        } catch (error) {
            console.error("Search Error:", error);
            resultsContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
        } finally {
            // UIを検索完了状態に戻す
            loader.style.display = 'none';
            dmmSearchButton.disabled = false;
            sokmilSearchButton.disabled = false;
        }
    };

    /**
     * 取得したデータを画面に描画する
     * @param {object} data - サーバーから返されたデータ
     * @param {Array<object>} data.results - 検索結果の配列
     * @param {Array<string>} data.keywords - AIが抽出したキーワードの配列
     * @param {string} [data.message] - 結果がない場合などのメッセージ
     */
    function displayResults(data) {
        resultsContainer.innerHTML = ''; // コンテナをクリア

        // AIが抽出したキーワードを表示
        if (data.keywords && data.keywords.length > 0) {
            const keywordsElement = document.createElement('p');
            keywordsElement.className = 'keywords-info';
            keywordsElement.innerHTML = `<strong>AIが抽出したキーワード:</strong> ${data.keywords.join(', ')}`;
            resultsContainer.appendChild(keywordsElement);
        }

        // 検索結果を表示
        if (data.results && data.results.length > 0) {
            data.results.forEach(item => {
                const itemElement = document.createElement('div');
                itemElement.className = 'item';
                
                // 各プロパティにデフォルト値を設定してエラーを防ぐ
                const title = item.title || 'タイトルなし';
                const affiliateURL = item.url || '#';
                const imageURL = item.imageUrl || 'https://via.placeholder.com/200x300.png?text=No+Image';
                const siteName = item.site || '情報なし';
                const maker = item.maker || '情報なし';
                const score = item.score || '評価なし';
                const reason = item.reason || '評価理由なし';

                itemElement.innerHTML = `
                    <img src="${imageURL}" alt="${title}">
                    <div class="item-info">
                        <h3><a href="${affiliateURL}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
                        <p><strong>サイト:</strong> ${siteName}</p>
                        <p><strong>メーカー:</strong> ${maker}</p>
                        <p class="score"><strong>AIによる一致度:</strong> ${score}</p>
                        <p><strong>AIの評価理由:</strong> ${reason}</p>
                    </div>
                `;
                resultsContainer.appendChild(itemElement);
            });
        } else {
             // 結果が0件の場合のメッセージを表示
            const messageElement = document.createElement('p');
            messageElement.textContent = data.message || '一致する作品が見つかりませんでした。';
            resultsContainer.appendChild(messageElement);
        }
    }
});
