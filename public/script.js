document.addEventListener('DOMContentLoaded', () => {
    console.log('MohammedYcomd Server UI Loaded Successfully');

    // Simple interaction: update resource usage randomly
    const progressFill = document.querySelector('.progress-fill');
    setInterval(() => {
        const randomUsage = Math.floor(Math.random() * 20) + 20; // 20-40%
        progressFill.style.width = `${randomUsage}%`;
    }, 3000);
});
