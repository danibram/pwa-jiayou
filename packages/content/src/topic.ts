/** Situation theme, finer subtopic, or combinable tag (verbos, preguntas…). */
export type TopicKind = 'theme' | 'subtopic' | 'tag';

/** A character may sit in more than one topic. 吃 is both a verb and food. */
export interface Topic {
  id: string;
  title: string;
  glyph: string;
  kind: TopicKind;
  /** Parent theme when kind is subtopic. */
  parentId?: string;
  /** Themes with listed:false stay out of Temas until we fill them. */
  listed?: boolean;
  characters: string[];
}
