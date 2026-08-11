document.addEventListener('DOMContentLoaded', () => {
    const totalCostInput = document.getElementById('totalCost');
    const peopleContainer = document.getElementById('peopleList');
    const addPersonBtn = document.getElementById('addPerson');
    const summaryDisplay = document.getElementById('summary');
    const shareList = document.getElementById('shareList');

    let people = [];
    let nextPersonId = 1;

    // Initialize with one default person
    addPerson();

    function updateCalc() {
        const totalCost = parseFloat(totalCostInput.value) || 0;
        const totalSlices = people.reduce((sum, p) => sum + p.slices, 0);
        const costPerSlice = totalSlices > 0 ? totalCost / totalSlices : 0;

        // Update summary displays
        shareList.innerHTML = '';
        let runningTotal = 0;

        people.forEach(p => {
            const share = p.slices * costPerSlice;
            runningTotal += share;
            const item = document.createElement('div');
            item.className = 'share-item';
            item.innerHTML = `
                <span class="share-name">${p.name}</span>
                <span class="share-value">${share.toFixed(2)}</span>
            `;
            shareList.appendChild(item);
        });

        // Update summary values
        summaryDisplay.querySelector('#totalSlices').textContent = totalSlices;
        const costPerSliceSpan = summaryDisplay.querySelector('#perSlice');
        costPerSliceSpan.textContent = `$${costPerSlice.toFixed(2)}`;

        const totalCostSpan = summaryDisplay.querySelector('#totalCostDisplay');
        totalCostSpan.textContent = `$${runningTotal.toFixed(2)}`;
    }

    function addPerson() {
        const personId = nextPersonId++;
        const person = {
            id: personId,
            name: `Person ${personId}`,
            slices: 0,
        };
        people.push(person);

        const personDiv = document.createElement('div');
        personDiv.className = 'person-entry';
        personDiv.dataset.id = personId;
        personDiv.innerHTML = `
            <span class="share-name">${person.name}</span>
            <div class="flex">
                <div class="flex">
                    <label class="label">Slices</label>
                    <input type="number" min="0" step="1" value="0" class="slices-input" style="width: 4rem; margin-left: 0.5rem;">
                </div>
                <button type="button" class="remove-person" title="Remove ${person.name}">✕</button>
            </div>
        `;

        personDiv.querySelector('.remove-person').addEventListener('click', () => {
            people = people.filter(p => p.id !== personId);
            personDiv.remove();
            updateCalc();
        });

        const slicesInput = personDiv.querySelector('.slices-input');
        slicesInput.addEventListener('input', () => {
            person.slices = parseInt(slicesInput.value) || 0;
            updateCalc();
        });

        peopleContainer.appendChild(personDiv);
        updateCalc();
    }

    // Input event listeners
    totalCostInput.addEventListener('input', updateCalc);
    // Add default person button
    addPersonBtn.addEventListener('click', () => addPerson());

    // Initial calculation
    updateCalc();
});