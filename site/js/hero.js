// Старый адрес hero.html?id=… — перекидываем на готовую страницу героя heroes/<имя>/.
import { loadCore } from './data.js';

const core = await loadCore().catch(() => null);
const id = Number(new URLSearchParams(location.search).get('id'));
const hero = core?.heroes.find((entry) => entry.id === id);
location.replace(hero?.slug ? `heroes/${hero.slug}/` : 'heroes/');
