import { ApiError, fail, permit } from '../shared/errors.mjs';
import { integer, text, eventKey } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit, changeState } from '../shared/audit.mjs';
import { getOrder, enqueueOrder } from './orders.mjs';

export async function handlePayments(db, user, method, id, action, body) {
  permit(user, 'administrador', 'administrativo');

  if (method === 'POST' && !id) {
    return createPayment(db, user, body);
  }

  if (action === 'validate') {
    return validatePayment(db, user, id, body);
  }
  throw new ApiError(404, 'Ruta no encontrada');
}

async function createPayment(db, user, body) {
  const currentOrder = await getOrder(db, integer(body.id_pedido, 'Pedido'));
  fail(!['TRANSFERENCIA', 'WEBPAY'].includes(body.medio), 'Medio de pago no habilitado');
  const amount = Number(body.monto);
  fail(!Number.isFinite(amount) || amount <= 0 || amount > 100000000, 'Monto inválido');
  const key = eventKey(body);
  const existing = (await rows(db, 'SELECT * FROM pago WHERE evento=$1', [key]))[0];
  if (existing) {
    fail(existing.id_pedido !== currentOrder.id_pedido, 'Evento ya usado en otro pedido', 409);
    return existing;
  }
  fail(
    amount >
      Number(currentOrder.cantidad * currentOrder.precio_unitario) - Number(currentOrder.pagado),
    'Monto supera el saldo pendiente',
    409,
  );
  const reference =
    body.medio === 'TRANSFERENCIA'
      ? text(body.comprobante, 'Comprobante', 100)
      : 'SIMULACION-LOCAL-' + key;
  const payment = await one(
    db,
    'INSERT INTO pago(id_pedido,id_medio_pago,monto,numero_comprobante,evento,cuenta_id) VALUES ($1,(SELECT id_medio_pago FROM medio_pago WHERE codigo=$2),$3,$4,$5,(SELECT id FROM cuenta_bancaria WHERE activa)) RETURNING *',
    [currentOrder.id_pedido, body.medio, amount, reference, key],
  );
  await audit(db, user, 'Registrar pago', payment.id_pago, { medio: body.medio, monto: amount });
  return payment;
}

async function validatePayment(db, user, id, body) {
  const payment = await one(db, 'SELECT * FROM pago WHERE id_pago=$1', [id]);
  fail(!['CONFIRMADO', 'RECHAZADO'].includes(body.estado), 'Estado inválido');
  if (payment.codigo_estado !== 'PENDIENTE') {
    fail(payment.codigo_estado !== body.estado, 'Pago ya revisado', 409);
    return payment;
  }
  const motivo = body.estado === 'RECHAZADO' ? text(body.motivo, 'Motivo de rechazo', 300) : null;
  await db.query(
    'UPDATE pago SET codigo_estado=$1,id_operador_validador=(SELECT id_operador FROM operador WHERE username=$2),fecha_validacion=now(),motivo_rechazo=$3 WHERE id_pago=$4',
    [body.estado, user.username, motivo, id],
  );
  if (body.estado === 'CONFIRMADO') {
    const medio = await one(db, 'SELECT codigo FROM medio_pago WHERE id_medio_pago=$1', [
      payment.id_medio_pago,
    ]);
    if (medio.codigo === 'TRANSFERENCIA' && payment.cuenta_id) {
      const account = await one(
        db,
        'UPDATE cuenta_bancaria SET comprobantes=comprobantes+1 WHERE id=$1 RETURNING *',
        [payment.cuenta_id],
      );
      if (account.comprobantes >= 45 && account.activa) {
        const nextAccount = await one(
          db,
          'SELECT id FROM cuenta_bancaria WHERE id<>$1 ORDER BY CASE WHEN id>$1 THEN 0 ELSE 1 END,id LIMIT 1',
          [account.id],
        );
        await db.query('UPDATE cuenta_bancaria SET activa=FALSE WHERE id=$1', [account.id]);
        await db.query('UPDATE cuenta_bancaria SET activa=TRUE,comprobantes=0 WHERE id=$1', [
          nextAccount.id,
        ]);
        await audit(db, user, 'Rotación tras 45 comprobantes', account.id, {
          siguiente: nextAccount.id,
        });
      }
    }
    const currentOrder = await getOrder(db, payment.id_pedido);
    if (
      Number(currentOrder.pagado) >= Number(currentOrder.cantidad * currentOrder.precio_unitario) &&
      currentOrder.entregados === 0
    ) {
      await changeState(db, user, currentOrder.id_pedido, 'Pagado', 'Pago anticipado validado');
    }
    await enqueueOrder(db, user, currentOrder.id_pedido);
  }
  await audit(db, user, 'Revisar pago', id, { estado: body.estado });
  return { ok: true };
}
