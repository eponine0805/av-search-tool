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
        if (!query) {
            resultsContainer.innerHTML = '<p>検索したい内容を入力してください。</p>';
            return;
        }

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
                const errorData = await response.json();
                throw new Error(errorData.error || `サーバーエラー: ${response.status}`);
            }

            const data = await response.json();
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
        resultsContainer.innerHTML = '';

        const results = data.results;
        const keywords = data.keywords;
        const message = data.message;
        
        if (keywords && Object.values(keywords).some(v => v && (Array.isArray(v) ? v.length > 0 : v))) {
             const keywordsContainer = document.createElement('div');
            keywordsContainer.className = 'keywords-info';
            let html = '<strong>AIが特定した検索キーワード:</strong><dl>';
            if(keywords.actor) html += `<dt>女優</dt><dd>${keywords.actor}</dd>`;
            if(keywords.series) html += `<dt>シリーズ</dt><dd>${keywords.series}</dd>`;
            if(keywords.genres && keywords.genres.length > 0) html += `<dt>ジャンル</dt><dd>${keywords.genres.join(', ')}</dd>`;
            if(keywords.titles && keywords.titles.length > 0) html += `<dt>タイトル</dt><dd>${keywords.titles.join(', ')}</dd>`;
            html += '</dl>';
            keywordsContainer.innerHTML = html;
            resultsContainer.appendChild(keywordsContainer);
        }

        if (results && results.length > 0) {
            results.forEach(item => {
                const title = item.title || 'タイトルなし';
                const affiliateURL = item.url || '#';
                const imageURL = item.imageUrl || 'https://via.placeholder.com/200x300.png?text=No+Image';
                const siteName = item.site || '';
                const maker = item.maker || '情報なし';
                const actors = item.actors || '情報なし';
                const genres = item.genres || '情報なし';
                const score = item.score;
                const reason = item.reason;
                
                const itemElement = document.createElement('div');
                itemElement.className = 'item';

                // スコアと理由の表示を復活
                let scoreHtml = '';
                if (score && reason) {
                    scoreHtml = `
                        <p class="score"><strong>関連スコア: ${score}</strong></p>
                        <p><strong>スコア内訳:</strong> ${reason}</p>
                    `;
                }

                itemElement.innerHTML = `
                    <img src="${imageURL}" alt="${title}">
                    <div class="item-info">
                        <h3><a href="${affiliateURL}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
                        ${scoreHtml}
                        <p><strong>サイト:</strong> ${siteName}</p>
                        <p><strong>メーカー:</strong> ${maker}</p>
                        <p><strong>出演者:</strong> ${actors}</p>
                        <p><strong>ジャンル:</strong> ${genres}</p>
                    </div>
                `;
                resultsContainer.appendChild(itemElement);
            });
        } else {
             const noResultsElement = document.createElement('p');
             noResultsElement.textContent = message || '一致する作品が見つかりませんでした。';
             resultsContainer.appendChild(noResultsElement);
        }
    }
});
