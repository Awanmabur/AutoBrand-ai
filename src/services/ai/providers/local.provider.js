function textResult({ taskType, prompt, brand, platform, fallbackReason }) {
  const brandName = brand?.name || 'your brand';
  const goal = prompt?.goal || prompt?.contentGoal || 'grow awareness';
  return {
    provider: 'local',
    ok: true,
    taskType,
    title: `${brandName} content draft`,
    caption: `Share a clear ${goal} message for ${brandName}. Lead with the customer problem, add one proof point, and end with a direct call to action.`,
    hashtags: ['#brand', '#growth', '#socialmedia'],
    notes: fallbackReason ? [`Fallback used: ${fallbackReason}`] : ['Local fallback output. Configure hosted providers for production AI.'],
    raw: { prompt, platform }
  };
}

async function run(input) {
  const taskType = input.taskType || 'text_generation';
  if (String(taskType).includes('image')) {
    return { provider: 'local', ok: true, taskType, url: '', prompt: input.prompt, notes: ['Local image placeholder.'] };
  }
  if (String(taskType).includes('video')) {
    return { provider: 'local', ok: true, taskType, scenes: [], prompt: input.prompt, notes: ['Local video storyboard placeholder.'] };
  }
  return textResult(input);
}

module.exports = { run };
