export function buildSystemPrompt(learningContext = {}) {
  let basePrompt = "You are a professional US real estate listing copywriter. Write concise, accurate copy with neutral tone. Avoid prohibited Fair Housing language (no references to protected classes, perceived safety, or ideal occupants). Do not invent facts. Respect provided length limits. Return only JSON in the specified schema.";
  
  if (learningContext?.successful_patterns?.length > 0) {
    basePrompt += `\n\nLearning Context: Based on previous successful listings, these patterns received high ratings:\n${
      learningContext.successful_patterns.map(p => 
        `Rating ${p.rating}/5: Used ${p.input.style?.voice || 'neutral'} voice for ${p.input.property?.type || 'property'} - successful elements: ${p.output.bullets?.slice(0,2).join(', ') || 'effective messaging'}`
      ).join('\n')
    }\nIncorporate successful patterns while maintaining originality.`;
  }
  
  return [
    { role: "system", content: basePrompt }
  ];
}

export function buildUserPrompt(payload, context = {}) {
  const { property, highlights = [], style = {}, compliance = { fair_housing: true } } = payload;
  const { voice = "neutral", reading_level = "standard", length = "mls", keywords = [] } = style;

  const schema = {
    description_mls: "string: 800–1000 characters, line breaks allowed",
    bullets: "array of 5–7 items, each ≤ 120 characters",
    social_caption: "string ≤ 2200 characters; include 3–6 relevant hashtags; no emojis unless requested"
  };

  const facts = {
    address: property?.address,
    type: property?.type,
    beds: property?.beds,
    baths: property?.baths,
    sqft: property?.sqft,
    lot_size: property?.lot_size,
    year_built: property?.year_built,
    parking: property?.parking,
    hoa: property?.hoa,
    school_district: property?.school_district
  };

  return [
    {
      role: "user",
      content: JSON.stringify({
        task: "Write listing copy in JSON schema (description_mls, bullets, social_caption).",
        facts,
        context, // ← allows MLS or Places enrichment later
        highlights,
        style: { voice, reading_level, length, keywords },
        constraints: {
          fair_housing_safe: compliance?.fair_housing ?? true,
          avoid_puffery: true,
          no_fabrication: true
        },
        output_schema: schema
      })
    }
  ];
}

export function buildCompliancePrompt(texts) {
  return [
    { role: "system", content: "Review the provided texts for US Fair Housing risk (protected classes, perceived safety, preferred occupants) and unverifiable claims. Return only JSON with an array of findings: type, original, suggest, note." },
    { role: "user", content: JSON.stringify({ texts }) }
  ];
}
