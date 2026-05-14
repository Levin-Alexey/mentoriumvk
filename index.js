import {
	PERSONAL_EFFICIENCY_COMMAND,
	handlePersonalEfficiencySelection,
} from "./handlers/personalEfficiency.js";
import {
	BUSINESS_SCALING_COMMAND,
	handleBusinessScalingSelection,
} from "./handlers/businessScaling.js";
import {
	PERSONAL_STUDY_AI_COMMAND,
	handlePersonalStudyAiSelection,
} from "./handlers/personalStudyAi.js";

const START_BONUS_COINS = 100;
const USER_SEGMENT_NEW = "new";
const USER_SEGMENT_REGISTERED_WEBINAR = "registered_webinar";

const REGISTERED_WEBINAR_INFO_COMMAND = "registered_webinar_info";
const REGISTERED_WEBINAR_GIFT_COMMAND = "registered_webinar_gift";
const REGISTERED_WEBINAR_SUPPORT_COMMAND = "registered_webinar_support";

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

const DEFAULT_REGISTERED_START_TEXT = `👋 Рады видеть вас снова!

Вы уже записаны на вебинар, супер.
Ниже быстрые кнопки, чтобы подготовиться к эфиру и не пропустить важное.`;

const REGISTERED_MENU_RESPONSES = {
	[REGISTERED_WEBINAR_INFO_COMMAND]:
		"📍 Вебинар пройдет онлайн. Ссылку и напоминание отправим в этот чат заранее.",
	[REGISTERED_WEBINAR_GIFT_COMMAND]:
		"🎁 Подарок (база нейросетей) отправим после вебинара. Если хотите, могу напомнить, как его получить.",
	[REGISTERED_WEBINAR_SUPPORT_COMMAND]:
		"💬 Если нужна помощь, напишите ваш вопрос в ответ на это сообщение, и куратор подключится.",
};

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

function buildRegisteredStartKeyboard() {
	return JSON.stringify({
		inline: true,
		buttons: [
			[
				{
					action: {
						type: "text",
						label: "📍 Где вебинар",
						payload: JSON.stringify({ command: REGISTERED_WEBINAR_INFO_COMMAND }),
					},
					color: "primary",
				},
			],
			[
				{
					action: {
						type: "text",
						label: "🎁 Как получить подарок",
						payload: JSON.stringify({ command: REGISTERED_WEBINAR_GIFT_COMMAND }),
					},
					color: "positive",
				},
			],
			[
				{
					action: {
						type: "text",
						label: "💬 Связь с куратором",
						payload: JSON.stringify({ command: REGISTERED_WEBINAR_SUPPORT_COMMAND }),
					},
					color: "secondary",
				},
			],
		],
	});
}
async function getUserSegmentByVkId(env, vkId) {
	if (!env.DB) {
		return USER_SEGMENT_NEW;
	}

	const userRow = await env.DB.prepare("SELECT id FROM users WHERE vk_id = ? LIMIT 1")
		.bind(vkId)
		.first();

	if (!userRow) {
		return USER_SEGMENT_NEW;
	}

	const registrationRow = await env.DB.prepare(
		"SELECT 1 FROM webinar_registrations WHERE user_id = ? LIMIT 1"
	)
		.bind(Number(userRow.id))
		.first();

	return registrationRow ? USER_SEGMENT_REGISTERED_WEBINAR : USER_SEGMENT_NEW;
}

function getStartScenario(env, segment) {
	if (segment === USER_SEGMENT_REGISTERED_WEBINAR) {
		return {
			text: env.REGISTERED_START_TEXT ?? DEFAULT_REGISTERED_START_TEXT,
			attachment:
				env.REGISTERED_START_IMAGE_ATTACHMENT ??
				env.REGISTERED_START_ATTACHMENT ??
				"",
			keyboard: buildRegisteredStartKeyboard(),
		};
	}

	return {
		text: env.START_TEXT ?? DEFAULT_START_TEXT,
		attachment: env.START_VIDEO_ATTACHMENT ?? env.START_ATTACHMENT ?? "",
		keyboard: buildStartKeyboard(),
	};
}

async function sendRegisteredMenuResponse({ env, peerId, command }) {
	const token = env.SK;
	if (!token) {
		console.error("SK token is not configured");
		return;
	}

	const responseText = REGISTERED_MENU_RESPONSES[command];
	if (!responseText) {
		return;
	}

	await sendVkMessage(token, {
		peer_id: String(peerId),
		message: responseText,
		random_id: String(Date.now() % 2147483647),
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

async function sendVkMessage(token, params) {
	const body = new URLSearchParams({
		...params,
		access_token: token,
		v: "5.199",
	});

	const resp = await fetch("https://api.vk.com/method/messages.send", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});

	const resultText = await resp.text();
	console.log("messages.send result:", resultText);
	return resultText;
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

			if (payloadCommand === PERSONAL_STUDY_AI_COMMAND) {
				ctx.waitUntil(
					handlePersonalStudyAiSelection({
						env,
						userId: message?.from_id,
						peerId: message?.peer_id,
						payload,
					}).catch((err) => {
						console.error("personal study AI handler failed:", String(err));
					})
				);
			}

			if (
				payloadCommand === REGISTERED_WEBINAR_INFO_COMMAND ||
				payloadCommand === REGISTERED_WEBINAR_GIFT_COMMAND ||
				payloadCommand === REGISTERED_WEBINAR_SUPPORT_COMMAND
			) {
				ctx.waitUntil(
					sendRegisteredMenuResponse({
						env,
						peerId: message?.peer_id,
						command: payloadCommand,
					}).catch((err) => {
						console.error("registered menu response failed:", String(err));
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
				const randomIdBase = Date.now();
				const vkId = Number(message?.from_id);

				ctx.waitUntil(
					(async () => {
						const segment = Number.isFinite(vkId)
							? await getUserSegmentByVkId(env, vkId)
							: USER_SEGMENT_NEW;

						if (segment === USER_SEGMENT_NEW) {
							await upsertUserAndApplyStartBonus(env, message);
						} else {
							console.log("Registered webinar user: skip start bonus", vkId);
						}

						const scenario = getStartScenario(env, segment);

						if (scenario.attachment) {
							await sendVkMessage(token, {
								peer_id: String(peerId),
								attachment: scenario.attachment,
								random_id: String(randomIdBase % 2147483647),
							});
						}

						await sendVkMessage(token, {
							peer_id: String(peerId),
							message: scenario.text,
							keyboard: scenario.keyboard,
							random_id: String((randomIdBase + 1) % 2147483647),
						});
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
