export const PERSONAL_STUDY_AI_COMMAND = "personal_study_ai";

export async function handlePersonalStudyAiSelection({ env, userId, peerId, payload }) {
	console.log("Personal study AI handler placeholder:", JSON.stringify({
		envConfigured: Boolean(env?.SK),
		userId,
		peerId,
		payload,
	}));
}