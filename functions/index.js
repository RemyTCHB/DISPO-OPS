const functions = require("firebase-functions/v1");
const { defineSecret, defineString, defineBoolean } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { isClosed, overdueItems, overdueDue, directoryFrom, sign, hubPayload, payloadKey, DEPTS } = require("./lib");
admin.initializeApp();

// Revamp settings. HUB_SYNC_SECRET is set once with `firebase functions:secrets:set HUB_SYNC_SECRET` (the same value
// as DISPO_OPS_SECRET in the hub's Vercel settings); never put its value in code. The sync into the hub is
// on while HUB_SYNC_ENABLED is true (functions/.env); set it to false and redeploy to switch it off.
const HUB_SECRET = defineSecret("HUB_SYNC_SECRET");
const HUB_URL = defineString("HUB_URL", { default: "https://hub.totalchb.com" });
const APP_URL = defineString("APP_URL", { default: "https://dispo-ops.totalchb.com" });
const HUB_SYNC_ENABLED = defineBoolean("HUB_SYNC_ENABLED", { default: false });
const ROOT_MANAGERS = ["brandy@totalchb.com", "systems@totalchb.com"];

// Centralized Default Preferences Mapping
function getDefaultPrefs(email) {
    const mail = (email || '').toLowerCase();
    const dispoAgents = ['carlos@totalchb.com', 'yanna@totalchb.com', 'moe@totalchb.com', 'sara@totalchb.com', 'sarah@totalchb.com'];
    const tcAgents = ['monz@totalchb.com', 'chris@totalchb.com'];
    const admins = ['brandy@totalchb.com', 'luke@totalchb.com', 'info@totalchb.com'];
    const superAdmin = ['systems@totalchb.com'];
    
    // Default split structure for Completions & Drafts/Links
    if (superAdmin.includes(mail)) {
        // SuperAdmin: Minimal spam, but YES to assigned tasks (turns, briefs, reminders, new assets)
        return { comments: false, new_assets: true, completions_phase: false, completions_task: false, completions_subtask: false, drafts_links: false, task_turns: true, daily_brief: true, reminders: true, reminder_interval: '4' };
    } else if (admins.includes(mail)) {
        // Admins: Full tracking + assigned tasks
        return { comments: true, new_assets: true, completions_phase: true, completions_task: true, completions_subtask: false, drafts_links: true, task_turns: true, daily_brief: true, reminders: true, reminder_interval: '4' };
    } else if (dispoAgents.includes(mail) || tcAgents.includes(mail)) {
        return { comments: true, new_assets: true, completions_phase: true, completions_task: true, completions_subtask: true, drafts_links: true, task_turns: true, daily_brief: true, reminders: true, reminder_interval: '4' };
    }
    
    return { comments: true, new_assets: true, completions_phase: true, completions_task: true, completions_subtask: false, drafts_links: true, task_turns: false, daily_brief: false, reminders: false, reminder_interval: '4' };
}

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

// Normalize an agent's name for matching: lowercase, and collapse the
// "sarah"/"sara" spelling mismatch into the canonical "sara".
// (Single source of truth — replaces the scattered inline checks.)
function normalizeAgent(name) {
    const v = (name || "").toLowerCase();
    return v === "sarah" ? "sara" : v;
}

// Extract the lowercase email prefix (the part before "@").
function emailPrefixOf(email) {
    const prefix = (email || "").split('@')[0].toLowerCase();
    // Map the 'systems' email to the dropdown name 'remy'
    if (prefix === 'systems') return 'remy';
    return prefix;
}

// Merge a user's saved preferences over their role-based defaults.
function resolveUserPrefs(prefs) {
    return { ...getDefaultPrefs(prefs.email), ...prefs };
}

// ============================================================================
// THE EVENT ROBOT (Triggers instantly on property saves/updates)
// Handles: New Assets, Completions, Comments, Drafts/Links, and Task Turns
// ============================================================================
// The hub secret is only attached while the sync is switched on, so deploying works before it is set up.
const WATCHER_OPTS = String(process.env.HUB_SYNC_ENABLED).toLowerCase() === 'true' ? { secrets: [HUB_SECRET] } : {};
exports.propertyWatcher = functions.runWith(WATCHER_OPTS).firestore
  .document("artifacts/{appId}/public/data/properties/{propertyId}")
  .onWrite(async (change, context) => {
    const db = admin.firestore();
    const beforeData = change.before ? change.before.data() : null;
    const afterData = change.after ? change.after.data() : null;
    const appId = context.params.appId;

    // The one-way sync into the hub (the hub mirrors each deal; does nothing while it is switched off)
    const hubJob = hubSyncDeal(db, appId, context.params.propertyId, afterData).catch(e => console.error('hub sync failed:', e.message));

    if (!afterData) return hubJob; // Property was deleted

    // Closed / Cancelled deals send no alerts (revamp); reopening a deal turns them back on.
    if (isClosed(afterData)) return hubJob;

    // OPTIMIZATION: fetch user preferences ONCE per trigger and reuse it across
    // every broadcast below, instead of re-querying inside each call.
    const prefsSnapshot = await db.collectionGroup("user_preferences").get();

    const address = afterData.address || "A Property";
    const strategy = afterData.exitStrategy || "Pipeline";
    const triggerAgent = afterData.lastEditedByName || null;
    let promises = [];

    // 1. NEW ASSET DEPLOYED
    if (!beforeData && afterData) {
        // Broadcast general deployment
        promises.push(sendNotificationBroadcast(db, prefsSnapshot, appId, "new_assets", {
            title: "New Asset Deployed 🚀",
            body: `${address} has been initialized in the ${strategy} protocol.`,
            extraData: { action: 'open_property', propId: afterData.id }
        }, null, triggerAgent));

        // Send tailored notification to agents with assigned tasks
        const assignedAgents = {};
        if (afterData.tasks) {
            afterData.tasks.forEach(t => {
                let assignee = normalizeAgent(t.assignee); // Normalize email matching
                if (assignee && assignee !== "unassigned") {
                    if (!assignedAgents[assignee]) assignedAgents[assignee] = [];
                    
                    // Extract just the short phase name (e.g. "Phase I")
                    const shortPhase = t.phase.split(':')[0].trim();
                    assignedAgents[assignee].push(`• [${shortPhase}] ${t.title}`);
                }
            });
        }

        for (const [agentPrefix, taskList] of Object.entries(assignedAgents)) {
            promises.push(sendNotificationBroadcast(db, prefsSnapshot, appId, "new_assets", {
                title: `New Assignment! 📋 (${taskList.length} Tasks)`,
                body: `${address} requires your action:\n${taskList.join('\n')}`,
                extraData: { action: 'open_property', propId: afterData.id }
            }, agentPrefix, null));
        }
    }

    if (beforeData && afterData) {
        // 2. OFFLINE COMMENTS
        const beforeComments = beforeData.comments || [];
        const afterComments = afterData.comments || [];
        if (afterComments.length > beforeComments.length) {
            const latestComment = afterComments[afterComments.length - 1];
            promises.push(sendNotificationBroadcast(db, prefsSnapshot, appId, "comments", {
                title: `New Comment: ${address}`,
                body: `${latestComment.author} says: "${latestComment.text}"`,
                extraData: { action: 'open_chat', propId: afterData.id, commentId: latestComment.id }
            }, null, latestComment.author)); 
        }

        // 3. DRAFTS OR LINKS UPDATED
        let draftOrLinkUpdated = false;
        let draftOrLinkDetails = "";

        if (afterData.tasks && beforeData.tasks) {
            for (let i = 0; i < afterData.tasks.length; i++) {
                const tAfter = afterData.tasks[i];
                const tBefore = beforeData.tasks.find(t => t.id === tAfter.id);
                if (!tBefore) continue;

                // Safely compare primitive strings
                const afterLink = tAfter.hyperlink || "";
                const beforeLink = tBefore.hyperlink || "";
                const afterDraft = tAfter.templateText || "";
                const beforeDraft = tBefore.templateText || "";

                if (afterLink !== beforeLink) {
                    draftOrLinkUpdated = true; draftOrLinkDetails = `Link saved for: ${tAfter.title}`; break;
                }
                if (afterDraft !== beforeDraft) {
                    draftOrLinkUpdated = true; draftOrLinkDetails = `Draft saved for: ${tAfter.title}`; break;
                }

                // Check subtasks for links and drafts
                if (tAfter.subtasks && tBefore.subtasks) {
                    for (let s = 0; s < tAfter.subtasks.length; s++) {
                        const subAfter = tAfter.subtasks[s];
                        const subBefore = tBefore.subtasks.find(sb => sb.id === subAfter.id);
                        if (!subAfter || !subBefore) continue;

                        const sAfterLink = subAfter.hyperlink || "";
                        const sBeforeLink = subBefore.hyperlink || "";
                        const sAfterDraft = subAfter.templateText || "";
                        const sBeforeDraft = subBefore.templateText || "";

                        if (sAfterLink !== sBeforeLink) {
                            draftOrLinkUpdated = true; draftOrLinkDetails = `Link saved on Subtask: ${subAfter.title}`; break;
                        }
                        if (sAfterDraft !== sBeforeDraft) {
                            draftOrLinkUpdated = true; draftOrLinkDetails = `Draft saved on Subtask: ${subAfter.title}`; break;
                        }
                    }
                }
                if (draftOrLinkUpdated) break;
            }
        }

        if (draftOrLinkUpdated) {
            promises.push(sendNotificationBroadcast(db, prefsSnapshot, appId, "drafts_links", {
                title: "Draft/Link Updated 📝",
                body: `${address} - ${draftOrLinkDetails}`,
                extraData: { action: 'open_property', propId: afterData.id }
            }, null, triggerAgent));
        }

        // 4. COMPLETIONS (Tracker, Phase, Section, Task, or Subtask)
        let justCompletedSection = null;
        let justCompletedPhase = null;
        let justCompletedTracker = false;
        let justCompletedTask = null;
        let justCompletedSubtask = null;

        const wasTrackerComplete = beforeData.tasks && beforeData.tasks.length > 0 && beforeData.tasks.every(t => t.completed && (!t.subtasks || t.subtasks.every(s => s.completed)));
        const isTrackerComplete = afterData.tasks && afterData.tasks.length > 0 && afterData.tasks.every(t => t.completed && (!t.subtasks || t.subtasks.every(s => s.completed)));
        
        if (isTrackerComplete && !wasTrackerComplete) {
            justCompletedTracker = true;
        } else if (afterData.tasks && beforeData.tasks) {
            // Check Phases
            const phases = [...new Set(afterData.tasks.map(t => t.phase))];
            for (const phase of phases) {
                const tasksInPhase = afterData.tasks.filter(t => t.phase === phase);
                const beforeTasksInPhase = beforeData.tasks.filter(t => t.phase === phase);
                const isCompleteNow = tasksInPhase.length > 0 && tasksInPhase.every(t => t.completed && (!t.subtasks || t.subtasks.every(s => s.completed)));
                const wasCompleteBefore = beforeTasksInPhase.length > 0 && beforeTasksInPhase.every(t => t.completed && (!t.subtasks || t.subtasks.every(s => s.completed)));
                if (isCompleteNow && !wasCompleteBefore) {
                    justCompletedPhase = phase; break;
                }
            }
            
            if (!justCompletedPhase) {
                // Check Main Tasks (Sections)
                const sections = [...new Set(afterData.tasks.map(t => t.mainTask))];
                for (const section of sections) {
                    const tasksInSection = afterData.tasks.filter(t => t.mainTask === section);
                    const beforeTasksInSection = beforeData.tasks.filter(t => t.mainTask === section);
                    const isCompleteNow = tasksInSection.length > 0 && tasksInSection.every(t => t.completed && (!t.subtasks || t.subtasks.every(s => s.completed)));
                    const wasCompleteBefore = beforeTasksInSection.length > 0 && beforeTasksInSection.every(t => t.completed && (!t.subtasks || t.subtasks.every(s => s.completed)));
                    if (isCompleteNow && !wasCompleteBefore) {
                        justCompletedSection = section; break;
                    }
                }
            }

            if (!justCompletedPhase && !justCompletedSection) {
                // Check Individual Tasks
                for (let i = 0; i < afterData.tasks.length; i++) {
                    const tAfter = afterData.tasks[i];
                    const tBefore = beforeData.tasks.find(t => t.id === tAfter.id);
                    if (!tBefore) continue;
                    
                    const tAfterDone = tAfter.completed && (!tAfter.subtasks || tAfter.subtasks.every(s => s.completed));
                    const tBeforeDone = tBefore.completed && (!tBefore.subtasks || tBefore.subtasks.every(s => s.completed));
                    
                    if (tAfterDone && !tBeforeDone) {
                        justCompletedTask = tAfter.title; break;
                    } else if (tAfter.subtasks && tBefore.subtasks) {
                        // Check Subtasks
                        for (let s = 0; s < tAfter.subtasks.length; s++) {
                            const subAfter = tAfter.subtasks[s];
                            const subBefore = tBefore.subtasks.find(sb => sb.id === subAfter.id);
                            if (subAfter && subBefore && subAfter.completed && !subBefore.completed) {
                                justCompletedSubtask = subAfter.title; break;
                            }
                        }
                    }
                }
            }
        }

        // Granular notification routing
        if (justCompletedTracker) {
            promises.push(sendNotificationBroadcast(db, prefsSnapshot, appId, "completions_phase", { title: "Asset 100% Complete! 🏆", body: `${address} pipeline has been fully executed.`, extraData: { action: 'open_property', propId: afterData.id } }, null, triggerAgent));
        } else if (justCompletedPhase) {
            promises.push(sendNotificationBroadcast(db, prefsSnapshot, appId, "completions_phase", { title: "Phase Complete! ✅", body: `${address} reached 100% for ${justCompletedPhase}.`, extraData: { action: 'open_property', propId: afterData.id } }, null, triggerAgent));
        } else if (justCompletedSection) {
            promises.push(sendNotificationBroadcast(db, prefsSnapshot, appId, "completions_phase", { title: "Section Complete! 📋", body: `${address} finished workflow: ${justCompletedSection}.`, extraData: { action: 'open_property', propId: afterData.id } }, null, triggerAgent));
        } else if (justCompletedTask) {
            promises.push(sendNotificationBroadcast(db, prefsSnapshot, appId, "completions_task", { title: "Task Complete! ✔️", body: `${address} - Task Finished: ${justCompletedTask}.`, extraData: { action: 'open_property', propId: afterData.id } }, null, triggerAgent));
        } else if (justCompletedSubtask) {
            promises.push(sendNotificationBroadcast(db, prefsSnapshot, appId, "completions_subtask", { title: "Subtask Complete! 🔨", body: `${address} - Subtask Finished: ${justCompletedSubtask}.`, extraData: { action: 'open_property', propId: afterData.id } }, null, triggerAgent));
        }

        // 5. TASK TURNS (Next Agent Assigned)
        const getNextAgent = (propData) => {
            if (!propData || !propData.tasks) return null;
            for (const t of propData.tasks) {
                if (t.isSOW && t.subtasks && t.subtasks.length > 0) {
                    if (!t.subtasks.every(s => s.completed)) return { agent: t.assignee, taskTitle: t.title };
                } else {
                    if (!t.completed || (t.subtasks && !t.subtasks.every(s => s.completed))) return { agent: t.assignee, taskTitle: t.title };
                }
            }
            return null;
        };

        const beforeNext = getNextAgent(beforeData);
        const afterNext = getNextAgent(afterData);

        if (afterNext && (!beforeNext || beforeNext.taskTitle !== afterNext.taskTitle || beforeNext.agent !== afterNext.agent)) {
            promises.push(sendNotificationBroadcast(db, prefsSnapshot, appId, "task_turns", {
                title: "Your Turn! 🎯",
                body: `${address} needs you to complete: ${afterNext.taskTitle}`,
                extraData: { action: 'open_property', propId: afterData.id }
            }, afterNext.agent, null)); 
        }
    }

    promises.push(hubJob);
    return Promise.all(promises);
});

// ============================================================================
// THE CLOCK ROBOTS (Pub/Sub Scheduled Triggers)
// Handles: Dynamic Reminders & Daily 10 AM Briefing
// ============================================================================

// 6. HOURLY OVERDUE REMINDERS
exports.hourlyReminders = functions.pubsub.schedule('0 * * * *').onRun(async (context) => {
    const db = admin.firestore();
    const propsSnapshot = await db.collectionGroup("properties").get();
    const prefsSnapshot = await db.collectionGroup("user_preferences").get();
    
    const now = Date.now();
    let promises = [];

    propsSnapshot.forEach(doc => {
        // Resilience: one malformed property must not abort reminders for everyone else.
        try {
            const prop = doc.data();
            if (isClosed(prop)) return; // Closed / Cancelled deals send no reminders (revamp)
            const lastEdited = prop.dateLastEdited || prop.dateStarted;
            if (!lastEdited) return; 
            const hoursSinceEdit = (now - lastEdited) / (1000 * 60 * 60);
            const floorHours = Math.floor(hoursSinceEdit);

            let nextTask = null;
            if (prop.tasks) {
                for (const t of prop.tasks) {
                    if (!t.completed || (t.subtasks && t.subtasks.length > 0 && !t.subtasks.every(s => s.completed))) {
                        nextTask = t; break;
                    }
                }
            }

            if (nextTask && floorHours > 0) {
                const assigneeName = normalizeAgent(nextTask.assignee);
                
                prefsSnapshot.forEach(prefDoc => {
                    const prefs = prefDoc.data();
                    const uid = prefDoc.id;
                    const appId = prefDoc.ref.path.split('/')[1] || "tchb-dispo-ops";
                    const emailPrefix = emailPrefixOf(prefs.email);
                    
                    // Merge DB prefs with fallback defaults incase they haven't saved explicitly
                    const userPrefs = resolveUserPrefs(prefs);
                    
                    if (emailPrefix === assigneeName && userPrefs.reminders === true) {
                        const interval = parseInt(userPrefs.reminder_interval || "4");
                        if (floorHours % interval === 0) {
                            promises.push(dispatchUserAppNotification(db, appId, uid, userPrefs, {
                                title: "⚠️ Reminder: Pending Task",
                                body: `${prop.address} is waiting on you: ${nextTask.title}`,
                                extraData: { action: 'open_property', propId: prop.id }
                            }));
                        }
                    }
                });
            }
        } catch (e) {
            console.error('hourlyReminders: skipped property', doc.id, e);
        }
    });

    // Overdue due dates (revamp): the task's owner gets one alert when a task or subtask passes its due date, then
    // one on their reminder interval until it is done, the date moves or the deal is closed. Uses Overdue Reminders.
    for (const doc of propsSnapshot.docs) {
        try {
            const prop = doc.data(), items = overdueItems(prop, now);
            if (!items.length) continue;
            const appId = doc.ref.path.split('/')[1] || "tchb-dispo-ops";
            const stateRef = db.doc(`artifacts/${appId}/server/overdue-${doc.id}`);
            const state = (await stateRef.get()).data() || {}, sent = state.sent || {}, next = {};
            for (const item of items) {
                const owner = normalizeAgent(item.owner);
                prefsSnapshot.forEach(prefDoc => {
                    const prefs = prefDoc.data(), userPrefs = resolveUserPrefs(prefs);
                    if (emailPrefixOf(prefs.email) !== owner || userPrefs.reminders !== true) return;
                    const key = item.key + '|' + prefDoc.id, last = sent[key] || null;
                    const interval = parseInt(userPrefs.reminder_interval || "4");
                    if (overdueDue(last, item, now, interval)) {
                        next[key] = { due: item.due, at: now };
                        promises.push(dispatchUserAppNotification(db, prefDoc.ref.path.split('/')[1] || appId, prefDoc.id, userPrefs, {
                            title: "Overdue: " + (item.task ? item.task + " - " : "") + item.title,
                            body: `${prop.address} - this was due ${new Date(item.due).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' })} ET.`,
                            extraData: { action: 'open_property', propId: prop.id }
                        }));
                    } else next[key] = last;
                });
            }
            promises.push(stateRef.set({ sent: next, checkedAt: now }));
        } catch (e) {
            console.error('hourlyReminders: overdue check skipped a property', doc.id, e.message);
        }
    }
    return Promise.all(promises);
});

// 7. DAILY 10 AM BRIEFING
exports.dailyBriefing = functions.pubsub.schedule('0 10 * * *').timeZone('America/New_York').onRun(async (context) => {
    const db = admin.firestore();
    const propsSnapshot = await db.collectionGroup("properties").get();
    const prefsSnapshot = await db.collectionGroup("user_preferences").get();
    
    let agentPendingDetails = {}; 
    
    propsSnapshot.forEach(doc => {
        // Resilience: skip and log a bad property rather than failing the whole briefing.
        try {
            const prop = doc.data();
            if (isClosed(prop)) return; // Closed / Cancelled deals are left out of the briefing (revamp)
            if (prop.tasks) {
                prop.tasks.forEach(t => {
                    if (!t.completed || (t.subtasks && t.subtasks.length > 0 && !t.subtasks.every(s => s.completed))) {
                        const agent = normalizeAgent(t.assignee || "Unassigned");
                        
                        if (!agentPendingDetails[agent]) agentPendingDetails[agent] = {};
                        if (!agentPendingDetails[agent][prop.address]) agentPendingDetails[agent][prop.address] = [];
                        
                        const shortPhase = t.phase.split(':')[0].trim();
                        agentPendingDetails[agent][prop.address].push(`• [${shortPhase}] ${t.title}`);
                    }
                });
            }
        } catch (e) {
            console.error('dailyBriefing: skipped property', doc.id, e);
        }
    });

    let promises = [];
    prefsSnapshot.forEach(prefDoc => {
        // Resilience: skip and log a bad prefs doc rather than failing the whole briefing.
        try {
            const prefs = prefDoc.data();
            const uid = prefDoc.id;
            const appId = prefDoc.ref.path.split('/')[1] || "tchb-dispo-ops";
            const agentPrefix = emailPrefixOf(prefs.email);
            
            const userPrefs = resolveUserPrefs(prefs);
            
            const agentDetails = agentPendingDetails[agentPrefix];
            if (userPrefs.daily_brief === true && agentDetails && Object.keys(agentDetails).length > 0) {
                
                let bodyText = "";
                let totalTasks = 0;
                
                for (const [address, tasks] of Object.entries(agentDetails)) {
                    bodyText += `🏠 ${address}:\n${tasks.join('\n')}\n\n`;
                    totalTasks += tasks.length;
                }

                // Cap the length just in case an agent has hundreds of tasks so the push notification doesn't crash
                if (bodyText.length > 800) {
                     bodyText = bodyText.substring(0, 800) + "...\n(Open app to see all)";
                }

                promises.push(dispatchUserAppNotification(db, appId, uid, userPrefs, {
                    title: `Good Morning! ☀️ (${totalTasks} Pending Tasks)`,
                    body: bodyText.trim(),
                    extraData: {}
                }));
            }
        } catch (e) {
            console.error('dailyBriefing: skipped prefs', prefDoc.id, e);
        }
    });
    return Promise.all(promises);
});

// ============================================================================
// NOTIFICATION BROADCAST ENGINE (Writes to Firestore History + Triggers FCM)
// Accepts a pre-fetched prefsSnapshot so we don't re-query on every broadcast.
// ============================================================================
async function sendNotificationBroadcast(db, prefsSnapshot, appId, prefKey, notification, targetAgentName = null, excludeAgentName = null) {
    let promises = [];

    prefsSnapshot.forEach((doc) => {
        // Resilience: a single bad prefs doc must not sink the whole broadcast.
        try {
            const prefs = doc.data();
            const uid = doc.id;
            const currentAppId = doc.ref.path.split('/')[1] || appId;

            const userEmailPrefix = emailPrefixOf(prefs.email);
            const userPrefs = resolveUserPrefs(prefs);

            if (targetAgentName) {
                if (normalizeAgent(targetAgentName) !== userEmailPrefix) return;
            }

            if (excludeAgentName) {
                if (normalizeAgent(excludeAgentName) === userEmailPrefix) return;
            }

            if (userPrefs[prefKey] === true) {
                promises.push(dispatchUserAppNotification(db, currentAppId, uid, userPrefs, notification));
            }
        } catch (e) {
            console.error('sendNotificationBroadcast: skipped prefs', doc.id, e);
        }
    });

    return Promise.all(promises);
}

// Low-level function to write DB record & send Push mapping
async function dispatchUserAppNotification(db, appId, uid, prefs, payload) {
    let promises = [];

    // 1. Write to User's private Notification History Subcollection
    const notifRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('notifications').doc();
    const notifData = {
        id: notifRef.id,
        title: payload.title,
        body: payload.body,
        extraData: payload.extraData || {},
        createdAt: Date.now(),
        read: false
    };
    promises.push(notifRef.set(notifData));

    // 2. Dispatch FCM to all active registered devices
    const validTokens = prefs.fcmTokens || [];

    if (validTokens.length > 0) {
        const pushPayload = { 
            notification: {
                title: payload.title,
                body: payload.body
            }, 
            webpush: {
                notification: {
                    icon: '/icon.svg',
                    // Force the raw GitHub image URL directly into the Android system tray badge
                    badge: 'https://raw.githubusercontent.com/RemyTCHB/TCHB-DISPO-OPS/69184e5b1ec879e3295a4282a3806ef901f30b58/icon.png'
                },
                fcmOptions: {
                    link: '/' 
                }
            },
            tokens: validTokens 
        };

        promises.push(admin.messaging().sendEachForMulticast(pushPayload).catch(e => console.error('FCM Error:', e)));
    }

    return Promise.all(promises);
}

// ============================================================================
// THE TEAM FROM THE UNIVERSAL TEAM HUB (revamp)
// A Manager clicks Refresh From Hub (Team): the hub's signed team endpoint answers with every department, saved in
// public/data/settings/directory (the page shows names and photos from it; deals keep storing first names).
// ============================================================================
exports.refreshDirectory = functions.runWith({ secrets: [HUB_SECRET] }).https.onCall(async (data, context) => {
    const email = String((context.auth && context.auth.token.email) || '').toLowerCase();
    if (!context.auth || !context.auth.token.email_verified || !email.endsWith('@totalchb.com')) {
        throw new functions.https.HttpsError('unauthenticated', 'Sign in with your company account.');
    }
    const db = admin.firestore(), ref = db.doc('artifacts/tchb-dispo-ops/public/data/settings/directory');
    const current = (await ref.get()).data() || {};
    const managers = [...ROOT_MANAGERS, ...(current.managers || [])];
    if (!managers.includes(email)) throw new functions.https.HttpsError('permission-denied', 'Only Managers can refresh the team.');
    const secret = HUB_SECRET.value();
    if (!secret) throw new functions.https.HttpsError('failed-precondition', 'The hub connection is not set up yet (HUB_SYNC_SECRET).');
    const body = JSON.stringify({ depts: DEPTS });
    const r = await fetch(HUB_URL.value().replace(/\/$/, '') + '/api/title-agent/team', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sign(secret, body) }, body });
    if (!r.ok) { console.error('refreshDirectory: the hub answered', r.status); throw new functions.https.HttpsError('unavailable', 'The hub did not answer (' + r.status + '). Try again later.'); }
    const dir = directoryFrom(await r.json(), Date.now(), (current.people && current.people[email] && current.people[email].name) || email.split('@')[0]);
    await ref.set(dir);
    const depts = new Set(Object.values(dir.people).map(p => p.dept).filter(Boolean)).size;
    console.log(`refreshDirectory: ${Object.keys(dir.people).length} people, ${depts} departments`);
    return { people: Object.keys(dir.people).length, depts };
});

// ============================================================================
// THE ONE-WAY SYNC INTO THE UNIVERSAL TEAM HUB (revamp; HUB_SYNC_ENABLED in functions/.env)
// Sent after each change that moves a deal's progress, plus a daily catch-up. Logs counts only.
// ============================================================================
async function hubSyncDeal(db, appId, id, prop, force = false) {
    if (!HUB_SYNC_ENABLED.value()) return null;
    const secret = HUB_SECRET.value(); if (!secret) return null;
    const payload = hubPayload(id, prop, APP_URL.value().replace(/\/$/, '')), key = payloadKey(payload);
    const stateRef = db.doc(`artifacts/${appId}/server/hubsync-${id}`), last = (await stateRef.get()).data() || {};
    if (!force && last.key === key) return null;              // nothing the hub shows has changed
    if (!last.key && (!prop || isClosed(prop))) return null;  // never sent: closed, cancelled or removed deals get no hub task
    const body = JSON.stringify(payload);
    const r = await fetch(HUB_URL.value().replace(/\/$/, '') + '/api/dispo-ops', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sign(secret, body) }, body });
    if (!r.ok) { await stateRef.set({ error: 'hub answered ' + r.status, at: Date.now() }, { merge: true }); throw new Error('hub answered ' + r.status); }
    await stateRef.set({ key, at: Date.now(), error: null }, { merge: true });
    return true;
}

exports.hubSyncDaily = functions.runWith({ secrets: [HUB_SECRET] }).pubsub.schedule('15 7 * * *').timeZone('America/New_York').onRun(async () => {
    if (!HUB_SYNC_ENABLED.value()) return null;
    const db = admin.firestore(), snap = await db.collectionGroup('properties').get();
    let ok = 0, failed = 0;
    for (const doc of snap.docs) {
        try { await hubSyncDeal(db, doc.ref.path.split('/')[1] || 'tchb-dispo-ops', doc.id, doc.data(), true); ok++; }
        catch (e) { failed++; }
    }
    console.log(`hubSyncDaily: ${snap.size} deals, sent ${ok}, failed ${failed}`);
    return null;
});

// ============================================================================
// SIGN IN AS (revamp; Remy only, like the hub's Login As User)
// Remy (systems@) signs in as a team member to see and work in DISPO OPS exactly as they do: the server makes a
// one-time sign-in for that person marked imp (Remy's email). { back: true } from that borrowed sign-in returns him to
// his own account. Never from a borrowed sign-in; only people who have signed in to DISPO OPS before. Each use is kept
// in artifacts/tchb-dispo-ops/server/audit-* (server only). Logs say what happened, never who.
// Needs the functions' service account to hold "Service Account Token Creator" (to sign the one-time sign-in).
// ============================================================================
const LOGIN_AS_ADMIN = "systems@totalchb.com";
exports.loginAs = functions.https.onCall(async (data, context) => {
    const token = (context.auth && context.auth.token) || {}, email = String(token.email || '').toLowerCase();
    if (!context.auth || !token.email_verified || !email.endsWith('@totalchb.com')) {
        throw new functions.https.HttpsError('unauthenticated', 'Sign in with your company account.');
    }
    const db = admin.firestore(), audit = row => db.doc(`artifacts/tchb-dispo-ops/server/audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).set({ ...row, at: Date.now() });
    if (data && data.back === true) {
        if (String(token.imp || '').toLowerCase() !== LOGIN_AS_ADMIN) throw new functions.https.HttpsError('permission-denied', 'This is not a Sign In As session.');
        const remy = await admin.auth().getUserByEmail(LOGIN_AS_ADMIN);
        const back = await admin.auth().createCustomToken(remy.uid);
        await audit({ kind: 'back to remy', by: LOGIN_AS_ADMIN, from: email });
        console.log('loginAs: back');
        return { token: back };
    }
    if (email !== LOGIN_AS_ADMIN || token.imp) throw new functions.https.HttpsError('permission-denied', 'Only Remy can do this.');
    const target = String((data && data.email) || '').trim().toLowerCase();
    if (!/^[^@\s/]+@totalchb\.com$/.test(target) || target === LOGIN_AS_ADMIN) throw new functions.https.HttpsError('invalid-argument', 'Which team member?');
    let user;
    try { user = await admin.auth().getUserByEmail(target); }
    catch (e) {
        if (e.code === 'auth/user-not-found') throw new functions.https.HttpsError('not-found', 'They have not signed in to DISPO OPS yet, so there is no account to open.');
        throw e;
    }
    if (user.disabled) throw new functions.https.HttpsError('failed-precondition', 'That account is turned off.');
    const out = await admin.auth().createCustomToken(user.uid, { imp: LOGIN_AS_ADMIN });
    await audit({ kind: 'login as', by: LOGIN_AS_ADMIN, as: target });
    console.log('loginAs: ok');
    return { token: out };
});
