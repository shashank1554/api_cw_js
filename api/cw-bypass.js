const API_BASE = process.env.CW_API_BASE || 'https://elearn.crwilladmin.com/api/v9';
const CW_KEY = process.env.CW_KEY;
const BRIGHTCOVE_ACCOUNT_ID = process.env.BRIGHTCOVE_ACCOUNT_ID;
const REQUEST_TIMEOUT = 30000;

function requestHeaders(token) {
  return {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    apptype: 'web',
    appver: '1',
    cwkey: CW_KEY,
    origin: 'https://web.careerwill.com',
    authorization: `Bearer ${token}`,
    token,
    'user-agent': 'Mozilla/5.0 (compatible; CareerWillStudy/1.0)',
  };
}

async function apiRequest(path, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: requestHeaders(token),
      signal: controller.signal,
    });
    const body = await response.json();

    if (!response.ok || body?.success === false) {
      throw new Error(body?.message || `CareerWill API returned ${response.status}`);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function getToken() {
  return process.env.CW_TOKEN;
}

async function fetchBatchContent(batchId, token) {
  const topicResponse = await apiRequest(`/batch-topic/${encodeURIComponent(batchId)}?type=class`, token);
  const topicData = topicResponse.data || {};
  const topics = topicData.batch_topic || [];

  const topicContent = await Promise.all(topics.map(async (topic) => {
    const topicId = topic.id;
    const [detailResponse, notesResponse] = await Promise.all([
      apiRequest(`/batch-detail/${encodeURIComponent(batchId)}?topicId=${encodeURIComponent(topicId)}`, token),
      apiRequest(`/batch-notes/${encodeURIComponent(batchId)}?topicId=${encodeURIComponent(topicId)}`, token),
    ]);

    const classes = detailResponse.data?.class_list?.classes || [];
    const lessons = await Promise.all(classes.slice().reverse().map(async (lesson) => {
      const classResponse = await apiRequest(`/class-detail/${encodeURIComponent(lesson.id)}`, token);
      const lessonUrl = classResponse.data?.class_detail?.lessonUrl || '';

      return {
        id: lesson.id,
        title: lesson.lessonName || 'Untitled lesson',
        type: lesson.lessonExt || 'unknown',
        sourceId: lessonUrl,
        playbackUrl: lesson.lessonExt === 'youtube'
          ? `https://www.youtube.com/embed/${encodeURIComponent(lessonUrl)}`
          : lesson.lessonExt === 'brightcove' && BRIGHTCOVE_ACCOUNT_ID
            ? `https://edge.api.brightcove.com/playback/v1/accounts/${encodeURIComponent(BRIGHTCOVE_ACCOUNT_ID)}/videos/${encodeURIComponent(lessonUrl)}/master.m3u8?bcov_auth=${encodeURIComponent(token)}`
            : '',
      };
    }));

    const notes = (notesResponse.data?.notesDetails || []).map((note) => ({
      title: note.docTitle || 'Untitled note',
      url: note.docUrl || '',
    }));

    return {
      id: topicId,
      title: topic.topicName || 'Untitled topic',
      lessons,
      notes,
    };
  }));

  const lessons = topicContent.flatMap((topic) => topic.lessons);
  const notes = topicContent.flatMap((topic) => topic.notes);

  return {
    id: String(batchId),
    title: topicData.batch_detail?.name || `Batch ${batchId}`,
    topics: topicContent,
    lessons,
    notes,
    counts: {
      topics: topicContent.length,
      lessons: lessons.length,
      notes: notes.length,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { batch_id: batchId } = req.query;
  const token = getToken();

  if (!token || !CW_KEY) {
    return res.status(500).json({
      success: false,
      error: 'CareerWill API is not configured. Set CW_TOKEN and CW_KEY in Render environment variables.',
    });
  }

  try {
    if (!batchId) {
      const response = await apiRequest('/my-batch', token);
      const batches = response.data?.batchData || [];
      return res.status(200).json({ success: true, data: { batches } });
    }

    const batch = await fetchBatchContent(batchId, token);
    return res.status(200).json({ success: true, data: { batch } });
  } catch (error) {
    console.error('CareerWill API error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
