import 'dotenv/config';
import {ensurePrivateLibraryContent} from '../services/privateLibraryContent.service.js';
console.log(await ensurePrivateLibraryContent());
