export interface Principle {
  num: string;
  title: string;
  body: string;
  bgBehavior: string;
}

export const principles: Principle[] = [
  {
    num: "01",
    title: "Spatial is Earned",
    body: "Spatial moments are rare and intentional, reserved for when they genuinely help. The restraint is what makes the spatial moments powerful.",
    bgBehavior: "depth-reveal",
  },
  {
    num: "02",
    title: "Body is the Anchor",
    body: "Between spatial moments, the body is home base. Information lives relative to you; your posture, your gaze, your position. It moves with you. Anchoring to objects and environments is powerful, but it\u2019s the exception. The body is where everything returns.",
    bgBehavior: "differential-parallax",
  },
  {
    num: "03",
    title: "Diegetic First",
    body: "The best spatial information feels like part of the world, not something layered on top of it. Embed meaning into the objects and spaces people are already looking at.",
    bgBehavior: "material-shift",
  },
  {
    num: "04",
    title: "Attention is the Budget",
    body: "Every spatial element takes attention from the real world, and that capacity is smaller than you think. One thing at a time. Make it count. Then get out of the way.",
    bgBehavior: "spotlight-follow",
  },
  {
    num: "05",
    title: "Context is Everything",
    body: "The same person needs different things in different moments; a parent at home, a collaborator at work, an explorer while traveling. Great spatial design reads the situation and adapts. Context shapes the experience.",
    bgBehavior: "context-shift",
  },
  {
    num: "06",
    title: "Transitions are Designed",
    body: "The moments between states matter as much as the states themselves. When context shifts, the experience needs a graceful handoff not an abrupt cut. Designed transitions feel natural; undesigned ones break the illusion.",
    bgBehavior: "choreographed-transition",
  },
  {
    num: "07",
    title: "The Agent Earns Trust",
    body: "A system that decides what you see holds real power. That power is earned through consistency and transparency. Users should always understand why something appeared, and always be able to dismiss it.",
    bgBehavior: "agent-highlight",
  },
  {
    num: "08",
    title: "Design Beyond the Wearer",
    body: "Spatial design affects everyone nearby, not just the person using it. The people around them didn\u2019t choose to be part of the experience, and people who process space differently need to be considered too. Design for everyone in the room.",
    bgBehavior: "perspective-split",
  },
];
