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

        // どのキーワードで検索されたかのメッセージを表示
        if (message) {
            const messageElement = document.createElement('p');
            messageElement.className = 'search-info';
            messageElement.innerHTML = `<strong>${message}</strong>`;
            resultsContainer.appendChild(messageElement);
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
                
                const itemElement = document.createElement('div');
                itemElement.className = 'item';

                itemElement.innerHTML = `
                    <img src="${imageURL}" alt="${title}">
                    <div class="item-info">
                        <h3><a href="${affiliateURL}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
                        <p><strong>サイト:</strong> ${siteName}</p>
                        <p><strong>メーカー:</strong> ${maker}</p>
                        <p><strong>出演者:</strong> ${actors}</p>
                        <p><strong>ジャンル:</strong> ${genres}</p>
                    </div>
                `;
                resultsContainer.appendChild(itemElement);
            });
        } else {
            if (!message) {
                 const noResultsElement = document.createElement('p');
                 noResultsElement.textContent = '一致する作品が見つかりませんでした。';
                 resultsContainer.appendChild(noResultsElement);
            }
        }
    }
});
