export function conceptToMarkdown(c, topicName) {
  const L = [`# ${c.title}`, `*Topic: ${topicName}*`, ''];
  const bullets = (title, items) => { if (items?.length) L.push(`## ${title}`, ...items.map((i) => `- ${i}`), ''); };
  const named = (title, items) => bullets(title, items?.map((x) => (x.description ? `**${x.name}**: ${x.description}` : x.name)));

  bullets('Alternative titles', c.alternativeTitles);
  L.push('## Opening hook', c.openingHook, '', '## Storyline', c.storyline, '', '## Narrative structure', c.narrativeStructure, '');
  if (c.durationMinutes) L.push(`**Estimated duration:** ${c.durationMinutes} min`, '');
  named('Main characters', c.mainCharacters);
  named('Locations', c.locations);
  bullets('Historical timeline', c.historicalTimeline?.map((e) => `${e.date ? `**${e.date}**: ` : ''}${e.event}`));
  L.push('## Scenes', '');
  for (const s of c.scenes) {
    L.push(`### ${s.number}. ${s.title} [${s.basis}${s.durationSeconds ? `, ~${s.durationSeconds}s` : ''}]`, s.description);
    if (s.environment3d) L.push(`- Environment: ${s.environment3d}`);
    if (s.camera) L.push(`- Camera: ${s.camera}`);
    if (s.soundEffects) L.push(`- Sound effects: ${s.soundEffects}`);
    if (s.music) L.push(`- Music: ${s.music}`);
    L.push('');
  }
  bullets('3D environments', c.environments3d);
  bullets('Character requirements', c.characterRequirements);
  bullets('Camera movements', c.cameraMovements);
  bullets('Sound effects', c.soundEffects);
  L.push('## Music atmosphere', c.musicAtmosphere, '', '## Closing scene', c.closingScene, '');
  bullets('Fact-check notes', c.factCheckNotes);
  return L.join('\n');
}