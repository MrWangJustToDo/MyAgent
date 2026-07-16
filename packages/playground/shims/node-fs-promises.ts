import * as fs from "./node-fs.js";

export {
  readFile,
  writeFile,
  readdir,
  mkdir,
  rm,
  unlink,
  access,
  stat,
  lstat,
  realpath,
  readlink,
  appendFile,
  open,
  rename,
} from "./node-fs.js";

export default fs.promises;
