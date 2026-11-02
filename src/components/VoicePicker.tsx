import { Component } from 'solid-js';
import SegmentedPicker from './SegmentedPicker';
import { currentVoiceMode, setVoiceMode, speak, voices } from '../utils/speech';

/** Choose where the listen button gets its sound. Each choice plays a short sample. */
const VoicePicker: Component<{ class?: string }> = (props) => (
  <SegmentedPicker
    class={props.class}
    label="Voz del audio"
    options={voices.map((option) => ({ value: option.id, label: option.region, detail: option.name }))}
    value={currentVoiceMode()}
    onChange={(id) => {
      setVoiceMode(id);
      speak('nǐ hǎo', '你好', false);
    }}
  />
);

export default VoicePicker;
