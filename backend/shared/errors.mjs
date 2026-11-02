export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (condition, message, status = 400) => {
  if (condition) {
    throw new ApiError(status, message);
  }
};

export function permit(user, ...roles) {
  fail(!roles.includes(user.rol), 'Acción no permitida para tu perfil', 403);
}
