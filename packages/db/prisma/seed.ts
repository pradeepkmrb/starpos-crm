import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();

const plans = [
  {
    code: "free",
    name: "Free Forever",
    priceInPaise: 0,
    maxChannels: 1,
    maxContacts: 500,
    maxAutomations: 1,
    maxApiRequestsPerMonth: 1000,
    maxTeamSeats: 1,
    aiAutoReply: false,
    advancedAnalytics: false,
    prioritySupport: false,
  },
  {
    code: "professional",
    name: "Professional",
    priceInPaise: 59900,
    maxChannels: 3,
    maxContacts: 5000,
    maxAutomations: 10,
    maxApiRequestsPerMonth: 50000,
    maxTeamSeats: 5,
    aiAutoReply: true,
    advancedAnalytics: true,
    prioritySupport: false,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    priceInPaise: 99900,
    maxChannels: -1,
    maxContacts: -1,
    maxAutomations: -1,
    maxApiRequestsPerMonth: -1,
    maxTeamSeats: -1,
    aiAutoReply: true,
    advancedAnalytics: true,
    prioritySupport: true,
  },
];

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
  }
  console.log(`Seeded ${plans.length} plans.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
