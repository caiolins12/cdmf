// MasterFinanceScreen - Redireciona para TeacherFinanceScreen que já suporta ambos os perfis (Master e Teacher)
// O TeacherFinanceScreen detecta automaticamente o perfil via useAuth().isMaster
// e renderiza o header e funcionalidades apropriadas para cada papel.

export { default } from "../teacher/TeacherFinanceScreen";
