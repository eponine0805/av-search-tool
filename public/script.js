// public/script.js の displayResults 関数をこれに置き換える

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
