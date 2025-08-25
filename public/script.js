document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const dmmSearchButton = document.getElementById('dmmSearchButton');
    const sokmilSearchButton = document.getElementById('sokmilSearchButton');
    const loader = document.getElementById('loader');
    const resultsContainer = document.getElementById('results');

    // DMM検索ボタンの処理
    dmmSearchButton.addEventListener('click', () => {
        // "dmm"という検索タイプを渡して実行
        performSearch('dmm');
    });

    // ソクミル検索ボタンの処理
    sokmilSearchButton.addEventListener('click', () => {
        // "sokmil"という検索タイプを渡して実行
        performSearch('sokmil');
    });

    const performSearch = async (searchType) => {
        const query = searchInput.value.trim();
        if (!query) {
            alert('検索内容を入力してください。');
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
                // 検索タイプ(dmm or sokmil)もバックエンドに送る
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
    
    // (displayResults関数は変更なし)
    function displayResults(results) {
        if (results.message) {
            resultsContainer.innerHTML = `<p>${results.message}</p>`;
            return;
        }
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<p>一致する作品が見つかりませんでした。</p>';
            return;
        }
        results.sort((a, b) => (b.score || 0) - (a.score || 0));
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
                    <p class="score">AIによる一致度: ${score}点</p>
                    <p><strong>AIの評価理由:</strong> ${reason}</p>
                </div>
            `;
            resultsContainer.appendChild(itemElement);
        });
    }
});
