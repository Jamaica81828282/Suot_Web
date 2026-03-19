// Simple Filter Logic
document.querySelectorAll('.cat-link').forEach(button => {
    button.addEventListener('click', () => {
        // Change active state
        document.querySelectorAll('.cat-link').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        const selectedCat = button.textContent.toLowerCase();
        
        document.querySelectorAll('.fashion-card').forEach(card => {
            const cardCat = card.getAttribute('data-category');
            if (selectedCat === 'all pieces' || selectedCat === cardCat) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
});