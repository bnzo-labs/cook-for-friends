/**
 * Seed content — fictional data only (public repo). Emails use @example.com.
 * Every customer-facing string exists in FR and EN.
 */
export type Localized<T = string> = { fr: T; en: T }

export const staffSeed = [
  { email: "admin@example.com", name: "Admin Démo", role: "admin" as const },
  { email: "staff@example.com", name: "Personnel Démo", role: "staff" as const },
]

export type InPersonSeed = {
  slug: Localized
  title: Localized
  summary: Localized
  description: Localized
  level: "beginner" | "intermediate" | "advanced"
  durationMinutes: number
  price: number
  sessions: { daysFromNow: number; hour: number; capacity: number }[]
}

export const inPersonCourses: InPersonSeed[] = [
  {
    slug: { fr: "macarons-francais", en: "french-macarons" },
    title: { fr: "Macarons français", en: "French macarons" },
    summary: {
      fr: "Maîtrisez la meringue italienne et le macaronage.",
      en: "Master Italian meringue and macaronage.",
    },
    description: {
      fr: "Un atelier de trois heures pour réussir des coques lisses et des garnitures gourmandes.",
      en: "A three-hour workshop to bake smooth shells and generous fillings.",
    },
    level: "intermediate",
    durationMinutes: 180,
    price: 9500,
    sessions: [
      { daysFromNow: 14, hour: 18, capacity: 8 },
      { daysFromNow: 21, hour: 13, capacity: 8 },
      { daysFromNow: 28, hour: 18, capacity: 1 },
    ],
  },
  {
    slug: { fr: "pain-au-levain", en: "sourdough-bread" },
    title: { fr: "Pain au levain", en: "Sourdough bread" },
    summary: {
      fr: "Du levain à la miche dorée, étape par étape.",
      en: "From starter to golden loaf, step by step.",
    },
    description: {
      fr: "Apprenez à nourrir un levain, façonner et cuire un pain croustillant.",
      en: "Learn to feed a starter, shape and bake a crusty loaf.",
    },
    level: "beginner",
    durationMinutes: 240,
    price: 11000,
    sessions: [
      { daysFromNow: 10, hour: 9, capacity: 10 },
      { daysFromNow: 17, hour: 9, capacity: 10 },
      { daysFromNow: 24, hour: 9, capacity: 6 },
    ],
  },
]

export type OnlineSeed = {
  slug: Localized
  title: Localized
  summary: Localized
  description: Localized
  level: "beginner" | "intermediate" | "advanced"
  price: number
  lessons: { title: Localized; body: Localized; isPreview: boolean; durationSec: number }[]
}

export const onlineCourses: OnlineSeed[] = [
  {
    slug: { fr: "bases-de-la-patisserie", en: "pastry-fundamentals" },
    title: { fr: "Les bases de la pâtisserie", en: "Pastry fundamentals" },
    summary: { fr: "Pâtes, crèmes et cuissons essentielles.", en: "Essential doughs, creams and bakes." },
    description: {
      fr: "Un cours en ligne pour bâtir des fondations solides.",
      en: "An online course to build solid foundations.",
    },
    level: "beginner",
    price: 4900,
    lessons: [
      { title: { fr: "La pâte sucrée", en: "Sweet shortcrust" }, body: { fr: "Sabler, fraiser, foncer.", en: "Rub, smear, line." }, isPreview: true, durationSec: 540 },
      { title: { fr: "La crème pâtissière", en: "Pastry cream" }, body: { fr: "Cuisson et texture.", en: "Cooking and texture." }, isPreview: false, durationSec: 620 },
      { title: { fr: "La pâte à choux", en: "Choux pastry" }, body: { fr: "Dessécher et pocher.", en: "Dry out and pipe." }, isPreview: false, durationSec: 710 },
    ],
  },
  {
    slug: { fr: "gateaux-de-fete", en: "celebration-cakes" },
    title: { fr: "Gâteaux de fête", en: "Celebration cakes" },
    summary: { fr: "Montage, glaçage et décor.", en: "Stacking, icing and decoration." },
    description: {
      fr: "Créez un gâteau étagé digne d'une vitrine.",
      en: "Build a layered cake worthy of a shop window.",
    },
    level: "intermediate",
    price: 6900,
    lessons: [
      { title: { fr: "Le biscuit génoise", en: "Genoise sponge" }, body: { fr: "Monter les œufs.", en: "Whip the eggs." }, isPreview: true, durationSec: 600 },
      { title: { fr: "La crème au beurre", en: "Buttercream" }, body: { fr: "Meringue suisse.", en: "Swiss meringue." }, isPreview: false, durationSec: 560 },
      { title: { fr: "Le montage", en: "Assembly" }, body: { fr: "Niveler et lisser.", en: "Level and smooth." }, isPreview: false, durationSec: 830 },
    ],
  },
]

export const productSeed = {
  slug: { fr: "coffret-biscuits", en: "cookie-box" },
  title: { fr: "Coffret de biscuits", en: "Cookie box" },
  description: { fr: "Douze biscuits artisanaux, faits à la main.", en: "Twelve handmade artisan cookies." },
  priceDisplay: { fr: "À partir de 30 $", en: "From $30" },
  externalUrl: "https://shop.example.com/cookie-box",
}

export const homeSeed = {
  slug: { fr: "accueil", en: "home" },
  title: { fr: "Accueil", en: "Home" },
  hero: {
    heading: { fr: "Cuisinez entre amis", en: "Cook with friends" },
    subheading: { fr: "Ateliers de pâtisserie à Montréal et en ligne.", en: "Pastry workshops in Montréal and online." },
    ctaLabel: { fr: "Voir les cours", en: "See courses" },
    ctaHref: "/courses",
  },
  gallery: { heading: { fr: "Nos créations", en: "Our creations" } },
  testimonials: {
    heading: { fr: "Ils ont adoré", en: "They loved it" },
    items: [
      { quote: { fr: "Un atelier chaleureux et précis.", en: "A warm and precise workshop." }, author: "Camille D.", role: { fr: "Participante", en: "Participant" } },
      { quote: { fr: "Mes macarons sont enfin réussis !", en: "My macarons finally worked!" }, author: "Alex R.", role: { fr: "Participant", en: "Participant" } },
    ],
  },
  cta: {
    heading: { fr: "Prêt à mettre la main à la pâte ?", en: "Ready to get your hands floury?" },
    body: { fr: "Réservez votre place dès aujourd'hui.", en: "Book your seat today." },
    buttonLabel: { fr: "Réserver", en: "Book now" },
    buttonHref: "/courses",
  },
  richText: {
    fr: "Cook for Friends propose des cours pour tous les niveaux.",
    en: "Cook for Friends offers classes for every level.",
  },
}

/** D1 defaults (DISCOVERY §8): ≥72 h refund 100 %, 24–72 h credit 100 %, <24 h none. */
export const cancellationTiers = [
  { minHoursBefore: 72, outcome: "refund" as const, percent: 100 },
  { minHoursBefore: 24, outcome: "credit" as const, percent: 100 },
  { minHoursBefore: 0, outcome: "none" as const, percent: 0 },
]
