document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const dmmSearchButton = document.getElementById('dmmSearchButton');
    const sokmilSearchButton = document.getElementById('sokmilSearchButton');
    const loader = document.getElementById('loader');
    const resultsContainer = document.getElementById('results');

    dmmSearchButton.addEventListener('click', () => {
        performSearch('dmm');
    });

    sokmilSearchButton.addEventListener('click', () => {
        performSearch('sokmil');
    });

    const performSearch = async (searchType) => {
        const query = searchInput.value.trim();

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

            if (!response.ok) {
                throw new Error(`サーバーエラー: ${response.status} ${response.statusText}`);
            }

            const data = await response.json(); // "results"から"data"に変更
            displayResults(data);

        } catch (error) {
            resultsContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
        } finally {
            loader.style.display = 'none';
            dmmSearchButton.disabled = false;
            sokmilSearchButton.disabled = false;
        }
    };
    
    function displayResults(data) {
    // 最初にコンテナを空にする
    resultsContainer.innerHTML = '';

    const results = data.results;
    const keywords = data.keywords;
    const message = data.message;

    // 1. キーワードが存在すれば、まず表示する
    if (keywords && keywords.length > 0) {
        const keywordsElement = document.createElement('p');
        keywordsElement.className = 'keywords-info';
        keywordsElement.innerHTML = `<strong>AIが抽出したキーワード:</strong> ${keywords.join(', ')}`;
        resultsContainer.appendChild(keywordsElement);
    }

    // 2. 検索結果（作品リスト）が存在すれば、表示する
    if (results && results.length > 0) {
        results.forEach(item => {
            const title = item.title || 'タイトルなし';
            const affiliateURL = item.url || '#';
            const imageURL = item.imageUrl || 'https://via.placeholder.com/200x300.png?text=No+Image';
            const maker = item.maker || '情報なし';
            const siteName = item.site || '';
            const score = item.score || '評価なし';
            const reason = item.reason || '評価理由なし';
            
            const itemElement = document.createElement('div');
            itemElement.className = 'item';
            itemElement.innerHTML = `
                <img src="${imageURL}" alt="${title}">
                <div class="item-info">
                    <h3><a href="${affiliateURL}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
                    <p><strong>サイト:</strong> ${siteName}</p>
                    <p><strong>メーカー:</strong> ${maker}</p>
                    <p class="score">AIによる一致度: ${score}</p>
                    <p><strong>AIの評価理由:</strong> ${reason}</p>
                </div>
            `;
            resultsContainer.appendChild(itemElement);
        });
    } else {
        // 3. 検索結果が0件の場合、メッセージを表示する
        const messageElement = document.createElement('p');
        // サーバーからのメッセージがあればそれを使い、なければ固定のメッセージを表示
        messageElement.textContent = message || '一致する作品が見つかりませんでした。';
        resultsContainer.appendChild(messageElement);
    }
}

        
