interface Window {
  Campaign: {
    characters: {
      models: any;
    };
  };
}

type CharacterId = string;

const characterSettings: Record<CharacterId, boolean> = {};
let activeCharacterSheets: Record<CharacterId, HTMLIFrameElement> = {};
let mostRecentWhisperSetting: boolean;

const logError = (entity: string) => console.error(`Could not find ${entity}`);

const getCharacterSheets = (): Record<CharacterId, HTMLIFrameElement> => {
  const iframes = Array.from(window.document.querySelectorAll('iframe'));
  return iframes.reduce((charSheets, iframe) => {
    const characterId = iframe.parentElement?.getAttribute('data-characterid') as CharacterId;
    if (characterId) {
      charSheets[characterId] = iframe;
    }
    return charSheets;
  }, {} as Record<CharacterId, HTMLIFrameElement>);
};

const getWhisperToggle = async (iframe: HTMLIFrameElement): Promise<HTMLInputElement> => {
  const findToggle = (): HTMLInputElement | null => {
    return iframe.parentElement?.parentElement?.querySelector(
      'input#whisper-toggle'
    ) as HTMLInputElement;
  };

  let callCount = 0;
  while (callCount < 10) {
    const toggle = findToggle();
    if (toggle) {
      return toggle;
    }
    if (!activeCharacterSheets[iframe.name]) {
      throw new Error('Could not find whisper toggle');
    }
    callCount++;
    await new Promise((resolve) => setTimeout(resolve, 100 * callCount));
  }

  throw new Error('Could not find whisper toggle after multiple attempts');
};

const updateWType = async (characterId: string, value: string) => {
  const characters = window.Campaign.characters.models;
  if (!characters) return logError('characters');

  const character = characters.find((c: any) => c.id === characterId);
  if (!character) return logError('character');

  const attributes = character.attribs.models;
  if (!attributes) return logError('attributes');

  const attribute = attributes.find((a: any) => a.attributes.name === 'wtype');
  if (!attribute) return logError('attribute wtype');

  attribute.save({ current: value });
  localStorage.setItem('whisperSettings', JSON.stringify({ characterSettings }));
};

const handleWhisperChange = async (characterId: CharacterId, shouldWhisper: boolean) => {
  updateWType(characterId, shouldWhisper ? '/w gm' : '');
};

const embedToggleWrapper = (iframe: HTMLIFrameElement): HTMLInputElement | undefined => {
  const header = iframe.parentElement?.parentElement?.firstChild as HTMLDivElement;
  if (!header || header.nodeName !== 'DIV') return;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display: flex;
    justify-content: center;
    position: absolute;
    right: 250px;
    top: 15px;
    gap: 5px;
  `;

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = true;
  toggle.name = 'whisper-toggle';
  toggle.id = 'whisper-toggle';

  const label = document.createElement('label');
  label.innerText = 'Rolls Public?';
  label.htmlFor = 'whisper-toggle';

  wrapper.append(label, toggle);
  header.appendChild(wrapper);

  return toggle;
};

const saveWhisperSetting = (characterId: string, shouldWhisper: boolean) => {
  localStorage.setItem(`whisper-toggle-${characterId}`, JSON.stringify(shouldWhisper));
  mostRecentWhisperSetting = shouldWhisper;
};

const getWhisperSetting = (characterId: string): boolean => {
  const storedValue = localStorage.getItem(`whisper-toggle-${characterId}`);
  return storedValue !== null ? JSON.parse(storedValue) : mostRecentWhisperSetting ?? true;
};

const callback = (mutationsList: MutationRecord[]) => {
  const newSheets = getCharacterSheets();

  // Remove any character sheets that are no longer open
  for (const id of Object.keys(activeCharacterSheets)) {
    if (!(id in newSheets)) {
      delete activeCharacterSheets[id];
    }
  }

  // Add whisper toggle to new character sheets
  for (const [characterId, iframe] of Object.entries(newSheets)) {
    if (characterId in activeCharacterSheets) continue;

    activeCharacterSheets[characterId] = iframe;
    characterSettings[characterId] = false;

    iframe.addEventListener('load', () => {
      const whisperToggle = embedToggleWrapper(iframe);
      if (!whisperToggle) return logError('whisper toggle');

      const shouldWhisper = getWhisperSetting(characterId);
      whisperToggle.checked = !shouldWhisper;
      characterSettings[characterId] = shouldWhisper;
      updateWType(characterId, shouldWhisper ? '/w gm' : '');

      whisperToggle.addEventListener(
        'change',
        () => {
          const shouldWhisper = !whisperToggle.checked;
          handleWhisperChange(characterId, shouldWhisper);
          saveWhisperSetting(characterId, shouldWhisper);
        },
        { passive: true }
      );
    });
  }
};

const observer = new MutationObserver(callback);
observer.observe(document.body, { childList: true, subtree: true });
