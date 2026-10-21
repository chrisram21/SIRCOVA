import * as usuariosService from './usuarios.service.js';

export async function listarRoles(req, res) {
  res.json(await usuariosService.listarRoles());
}
