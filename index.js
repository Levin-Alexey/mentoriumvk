import {
	PERSONAL_EFFICIENCY_COMMAND,
	handlePersonalEfficiencySelection,
} from "./handlers/personalEfficiency.js";
import {
	BUSINESS_SCALING_COMMAND,
	handleBusinessScalingSelection,
} from "./handlers/businessScaling.js";

const START_BONUS_COINS = 100;

const DEFAULT_START_TEXT = `👋 Приветствую!
Добро пожаловать! 

Бонусный счет открыт: +100 AI-Coins 🪙 начислены!

Чтобы вебинар прошел максимально полезно, я хочу адаптировать эфир под важные для Вас задачи.
За выбор направления я начислю еще 50 монет.

👇 Посмотрите, что нас ждет на эфире (1 час):
🔹 Блок 1: ИИ как привычка (делегируем рутину).
🔹 Блок 2: Бесплатный арсенал (инструменты мощнее ChatGPT).
🔹 Блок 3: Тотальная автоматизация (схемы экономии времени).

🎁 Подарок (База нейросетей) будет оправлен после вебинара

Для каких целей хотите освоить ИИ?`;

function buildStartKeyboard() {
	return JSON.stringify({
		inline: true,
		buttons: [
			[
				{
					action: {
						type: "text",
						label: "🧑‍💻 Для себя (+50 🪙)",
						payload: JSON.stringify({ command: PERSONAL_EFFICIENCY_COMMAND }),
					},
					color: "primary",
				},
			],
			[
				{
					action: {
						type: "text",
						label: "💼 Для бизнеса (+50 🪙)",
						payload: JSON.stringify({ command: BUSINESS_SCALING_COMMAND }),
					},
					color: "positive",
				},
			],
		],
	});
}

async function upsertUserAndApplyStartBonus(env, message) {
	if (!env.DB) {
		console.error("DB binding is not configured");
		return;
	}

	const vkId = Number(message?.from_id);
	if (!Number.isFinite(vkId)) {
		console.error("Invalid VK user id in message");
		return;
	}

	const userName = message?.from_id ? `vk_${message.from_id}` : null;
	const existingUser = await env.DB.prepare(
		"SELECT id FROM users WHERE vk_id = ? LIMIT 1"
	)
		.bind(vkId)
		.first();

	if (!existingUser) {
		await env.DB.prepare(
			"INSERT INTO users (vk_id, user_name, direction, ai_coins_balance, ref_source) VALUES (?, ?, ?, ?, ?)"
		)
			.bind(vkId, userName, null, START_BONUS_COINS, "vk")
			.run();

		const createdUser = await env.DB.prepare(
			"SELECT id FROM users WHERE vk_id = ? LIMIT 1"
		)
			.bind(vkId)
			.first();

		if (!createdUser?.id) {
			console.error("Failed to load created user by vk_id");
			return;
		}

		await env.DB.prepare(
			"INSERT INTO ai_coin_operations (user_id, amount, operation_type, reason, description) VALUES (?, ?, ?, ?, ?)"
		)
			.bind(
				Number(createdUser.id),
				START_BONUS_COINS,
				"earned",
				"start_bonus",
				"Начисление за старт в VK-боте"
			)
			.run();

		console.log("Created VK user and applied start bonus:", vkId);
		return;
	}

	await env.DB.prepare("UPDATE users SET user_name = COALESCE(?, user_name) WHERE id = ?")
		.bind(userName, Number(existingUser.id))
		.run();
	console.log("VK user already exists, start bonus skipped:", vkId);
}

export default {
	async fetch(request, env, ctx) {
		if (request.method !== "POST") {
			return new Response("MentoriumVK Worker is running", {
				headers: { "content-type": "text/plain; charset=UTF-8" },
			});
		}

		let body;
		try {
			body = await request.json();
		} catch {
			console.error("Failed to parse JSON body");
			return new Response("bad request", { status: 400 });
		}

		console.log("Incoming event:", JSON.stringify(body));

		if (body?.type === "confirmation" && body?.group_id === 238551367) {
			console.log("Responding with confirmation string");
			return new Response("c4d75344", {
				headers: { "content-type": "text/plain; charset=UTF-8" },
			});
		}

		const expectedSecret = env.secret ?? env.SECRET;
		console.log("Secret check — expected set:", !!expectedSecret, "| received:", body?.secret);
		if (!expectedSecret || body?.secret !== expectedSecret) {
			console.error("Secret mismatch, returning 403");
			return new Response("forbidden", { status: 403 });
		}

		if (body?.type === "message_new") {
			const message = body?.object?.message ?? {};
			const text = (message?.text ?? "").trim().toLowerCase();
			let payload = {};
			if (typeof message?.payload === "string" && message.payload.length > 0) {
				try {
					payload = JSON.parse(message.payload);
				} catch {
					payload = {};
				}
			}

			const payloadCommand = String(payload?.command ?? "").trim().toLowerCase();
			const isStart =
				text === "start" ||
				text === "старт" ||
				text === "начать" ||
				payloadCommand === "start";

			if (payloadCommand === PERSONAL_EFFICIENCY_COMMAND) {
				ctx.waitUntil(
					handlePersonalEfficiencySelection({
						env,
						userId: message?.from_id,
						peerId: message?.peer_id,
						payload,
					}).catch((err) => {
						console.error("personal efficiency handler failed:", String(err));
					})
				);
			}

			if (payloadCommand === BUSINESS_SCALING_COMMAND) {
				ctx.waitUntil(
					handleBusinessScalingSelection({
						env,
						userId: message?.from_id,
						peerId: message?.peer_id,
						payload,
					}).catch((err) => {
						console.error("business scaling handler failed:", String(err));
					})
				);
			}

			if (isStart) {
				const token = env.SK;
				if (!token) {
					console.error("SK token is not configured");
					return new Response("ok", {
						headers: { "content-type": "text/plain; charset=UTF-8" },
					});
				}

				const peerId = message?.peer_id;
				const startText = env.START_TEXT ?? DEFAULT_START_TEXT;
				const attachment = env.START_ATTACHMENT ?? "";
				const randomId = Math.floor(Date.now() % 2147483647);
				const keyboard = buildStartKeyboard();

				ctx.waitUntil(
					(async () => {
						await upsertUserAndApplyStartBonus(env, message);

						const params = new URLSearchParams({
							peer_id: String(peerId),
							message: startText,
							random_id: String(randomId),
							keyboard,
							access_token: token,
							v: "5.199",
						});

						if (attachment) {
							params.set("attachment", attachment);
						}

						const resp = await fetch("https://api.vk.com/method/messages.send", {
							method: "POST",
							headers: { "content-type": "application/x-www-form-urlencoded" },
							body: params.toString(),
						});

						const result = await resp.text();
						console.log("messages.send result:", result);
					})().catch((err) => {
						console.error("messages.send failed:", String(err));
					})
				);
			}
		}

		console.log("Returning ok for type:", body?.type);
		return new Response("ok", {
			headers: { "content-type": "text/plain; charset=UTF-8" },
		});
	},
};
