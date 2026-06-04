const workflowSteps = [
  {
    title: 'Scan and cache',
    copy: 'Refresh the target inventory, then scan the source library against the cached vault.'
  },
  {
    title: 'Review edge cases',
    copy: 'Approve copy, skip duplicates, or mark deliberate upgrades for ambiguous matches.'
  },
  {
    title: 'Dry-run first',
    copy: 'Generate the sandbox plan and inspect destination naming before any real target writes.'
  },
  {
    title: 'Execute with safeguards',
    copy: 'Run sandbox copy first, then unlock real target copy only when the output looks correct.'
  }
];

const container = document.getElementById('workflow-steps');

if (container) {
  workflowSteps.forEach((step, index) => {
    const card = document.createElement('article');
    card.className = 'step';

    const number = document.createElement('div');
    number.className = 'step-number';
    number.textContent = `Step ${index + 1}`;

    const title = document.createElement('div');
    title.className = 'step-title';
    title.textContent = step.title;

    const copy = document.createElement('div');
    copy.className = 'step-copy';
    copy.textContent = step.copy;

    card.append(number, title, copy);
    container.append(card);
  });
}