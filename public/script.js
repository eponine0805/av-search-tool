// DOMの読み込みが完了してからスクリプトを実行する
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const loader = document.getElementById('loader');
    const resultsContainer = document.getElementById('results');

    // searchButtonが存在しない場合は、ここで処理を中断
    if (!searchButton) {
        console.error('Error: searchButton not found.');
        return;
    }

    searchButton.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        if (!query) {
            alert('検索内容を入力してください。');
            return;
        }

        loader.style.display = 'block';
        resultsContainer.innerHTML = '';
        searchButton.disabled = true;

        try {
            const response = await fetch('/.netlify/functions/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userQuery: query }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`サーバーエラー: ${response.status} ${response.statusText}. ${errorText}`);
            }

            const results = await response.json();
            displayResults(results);

        } catch (error) {
            resultsContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
            console.error(error);
        } finally {
            loader.style.display = 'none';
            searchButton.disabled = false;
        }
    });

    function displayResults(results) {
        if (results.message) {
            resultsContainer.innerHTML = `<p>${results.message}</p>`;
            return;
        }
        
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<p>一致する作品が見つかりませんでした。</p>';
            return;
        }

        results.forEach(item => {
            const title = item.title || 'タイトルなし';
            const affiliateURL = item.affiliateURL || '#';
            const imageURL = item.imageURL?.large || 'https://via.placeholder.com/200x300.png?text=No+Image';
            
            const actressesArray = item.iteminfo?.actress;
            const actresses = Array.isArray(actressesArray) && actressesArray.length > 0
                ? actressesArray.map(a => a.name).join(', ')
                : '情報なし';

            const score = item.score || '評価なし';
            const reason = item.reason || '評価理由なし';
            
            const itemElement = document.createElement('div');
            itemElement.className = 'item';
            itemElement.innerHTML = `
                <img src="${imageURL}" alt="${title}">
                <div class="item-info">
                    <h3><a href="${affiliateURL}" target="_blank">${title}</a></h3>
                    <p><strong>出演:</strong> ${actresses}</p>
                    <p class="score">AIによる一致度: ${score}点</p>
                    <p><strong>AIの評価理由:</strong> ${reason}</p>
                </div>
            `;
            resultsContainer.appendChild(itemElement);
        });
        // ...既存のdisplayResults関数の下に、まるごと追加...

const fc2SearchButton = document.getElementById('fc2SearchButton');

if (fc2SearchButton) {
    fc2SearchButton.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        if (!query) {
            alert('検索内容を入力してください。');
            return;
        }

        loader.style.display = 'block';
        resultsContainer.innerHTML = '';
        fc2SearchButton.disabled = true;

        try {
            // ★★★ Netlify用の正しいエンドポイントを呼び出す ★★★
            const response = await fetch('/.netlify/functions/fc2-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userQuery: query }),
            });

            if (!response.ok) {
                throw new Error(`サーバーエラー: ${response.statusText}`);
            }

            const results = await response.json();
            displayFc2Results(results);

        } catch (error) {
            resultsContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
        } finally {
            loader.style.display = 'none';
            fc2SearchButton.disabled = false;
        }
    });
}

function displayFc2Results(results) {
    if (!results || results.length === 0) {
        resultsContainer.innerHTML = '<p>一致するライブ配信は見つかりませんでした。</p>';
        return;
    }

    results.forEach(item => {
        const title = item.title || 'タイトルなし';
        const channelUrl = `https://live.fc2.com/${item.channelid}`;
        const imageURL = item.image || 'https://via.placeholder.com/200x150.png?text=No+Image';
        const user = item.name || '配信者不明';

        const itemElement = document.createElement('div');
        itemElement.className = 'item';
        itemElement.innerHTML = `
            <img src="${imageURL}" alt="${title}">
            <div class="item-info">
                <h3><a href="${channelUrl}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
                <p><strong>配信者:</strong> ${user}</p>
            </div>
        `;
        resultsContainer.appendChild(itemElement);
    }
});
