const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();

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
exports.propertyWatcher = functions.firestore
  .document("artifacts/{appId}/public/data/properties/{propertyId}")
  .onWrite(async (change, context) => {
    const db = admin.firestore();
    const beforeData = change.before ? change.before.data() : null;
    const afterData = change.after ? change.after.data() : null;
    const appId = context.params.appId;

    if (!afterData) return null; // Property was deleted

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