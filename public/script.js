document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const dmmSearchButton = document.getElementById('dmmSearchButton');
    const sokmilSearchButton = document.getElementById('sokmilSearchButton');
    const loader = document.getElementById('loader');
    const resultsContainer = document.getElementById('results');

    // DMM検索ボタンの処理
    dmmSearchButton.addEventListener('click', () => {
        performSearch('dmm');
    });

    // ソクミル検索ボタンの処理
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

            const results = await response.json();
            displayResults(results);

        } catch (error) {
            resultsContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
        } finally {
            loader.style.display = 'none';
            dmmSearchButton.disabled = false;
            sokmilSearchButton.disabled = false;
        }
    };
    
    // public/script.js の displayResults 関数をこれに置き換える

function displayResults(data) {
    // dataがキーワードと結果を含むオブジェクトになった
    const results = data.results;
    const keywords = data.keywords;

    if (data.message) {
        resultsContainer.innerHTML = `<p>${data.message}</p>`;
        return;
    }
    
    // ★★★ キーワードを表示する処理を追加 ★★★
    if (keywords && keywords.length > 0) {
        const keywordsElement = document.createElement('p');
        keywordsElement.innerHTML = `<strong>AIが生成したキーワード:</strong> ${keywords.join(', ')}`;
        resultsContainer.appendChild(keywordsElement);
    }
    // ★★★ ここまで追加 ★★★

    if (!results || results.length === 0) {
        const noResultsElement = document.createElement('p');
        noResultsElement.textContent = '一致する作品が見つかりませんでした。';
        resultsContainer.appendChild(noResultsElement);
        return;
    }

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
}
