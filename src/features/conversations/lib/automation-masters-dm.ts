type Path = 1 | 2 | 3 | 4;

export function personalize(template: string, vars: { name: string }) {
  return template.replaceAll("[name]", vars.name);
}

export function parseChoice(text: string): Path | null {
  const v = (text ?? "").trim();
  if (!v) return null;
  // Accept "2", "2.", "2 - Building...", "2) Building..." etc.
  const m = v.match(/^([1-4])(?:\b|[\s\.\)\-:])/);
  if (!m) return null;
  return Number(m[1]) as Path;
}

export const WELCOME_TEMPLATE = [
  "Hey [name]! Welcome to Automation Masters! 😊",
  "",
  "Quick question: What's the one thing you're stuck on right now?",
  "",
  "1. Getting clients",
  "2. Building your first automation",
  "3. Improving what you've already built",
  "4. Something else",
  "",
  "Just reply with the number. I might send you the exact resource you need.",
].join("\n");

export const PATH_MESSAGES: Record<Exclude<Path, 4>, string[]> = {
  1: [
    "Hey [name]! 😊\n\nLove that you're focused on getting clients! Most builders struggle because they're targeting the wrong people.\n\nI put together a $100K Automation Playbook that helps you pick better industries and decision-makers so outreach actually converts.\n\nWant a free copy?",
    "Here's your free copy of the $100K Playbook 📘\n\nUse it to sanity-check:\n• Who you're targeting?\n• Who can actually say \"yes\"?\n• Whether the problem is worth paying for?\n\nRemember, even small fixes here usually unlock faster wins.",
    "Quick context that might help 😊\n\nWhich part feels harder right now?\n• Figuring out who to target / getting replies from outreach\n• Talking to the right decision-maker\n• Pitching features instead of outcomes\n• Solving a problem that feels \"nice to have\"",
  ],
  2: [
    "Hey [name]! 😊\n\nBuilding your first automation is a big milestone. A lot of people overthink it and never finish one.\n\nI created a First Automation Starter Pack (simple starter workflow) that walks you through building a small automation end-to-end.\n\nWant me to send it over for free so you can start building?",
    "Here's the First Automation Starter Pack 🚀\n\nThe goal isn't to build something impressive; it's to:\n• Understand triggers + actions + outcomes\n• Finish one full workflow\n• Build confidence instead of jumping between tools",
    "Quick heads-up as you work through it, [name] 😊\n\nIf something breaks or doesn't behave as expected, that's completely normal. Don't restart — just check where the trigger happens.",
    "Quick question:\n\nDo you feel more stuck finishing the workflow, or debugging when something breaks?",
  ],
  3: [
    "Hey [name]! 😊\n\nIf you've already built automations, the next level isn't building more — it's improving what you already have.\n\nI put together an Automation Optimization Checklist that helps you:\n• Stress-test existing workflows\n• Spot fragile logic\n• Simplify steps that don't need to be complex",
    "Here's the Automation Optimization Checklist ✅\n\nUse it to:\n• Find where workflows slow down\n• See why errors keep happening\n• Make automation more reliable and scalable",
    "Quick tip for you 😊\n\nA lot of builders get stuck because one workflow does multiple jobs — split it.\n\nOne workflow = one purpose.",
    "Do your automations handle more than one thing, or are they already split?\n\nWant me to share how pros fix this consistently?",
  ],
};

export const PATH4_MESSAGES: string[] = [
  "Nice [name]! 😊\n\nWhat's your main goal right now?",
  "Got it! Most people choose one of two paths…\n\n1) Get clients first\n2) Build your first automation first\n\nWhich one is closer to you right now? (Reply 1 or 2)",
];

// Generic response when user sends something that's not a valid choice (1-4)
export const INVALID_CHOICE_RESPONSE = "Thanks for your message, [name]! 😊\n\nI'm here to help with automation resources. If you'd like to get started, just reply with a number (1-4) from the options I shared earlier, and I'll send you the right resource.\n\nIf you have a specific question, I'll make sure someone from our team gets back to you soon.";
