'use strict';

import DID_API from './api.json' assert { type: 'json' };
if (DID_API.key == '🤫') alert('Please put your api key inside ./api.json and restart..')

const RTCPeerConnection = (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection).bind(window);

let peerConnection; //this have function for change this value
let streamId;
let sessionId;
let sessionClientAnswer;


const talkVideo = document.getElementById('talk-video');
talkVideo.setAttribute('playsinline', ''); // pada tag ditambahkan atribut ini
const peerStatusLabel = document.getElementById('peer-status-label'); //Peer connection status
const iceStatusLabel = document.getElementById('ice-status-label'); // ICE status
const iceGatheringStatusLabel = document.getElementById('ice-gathering-status-label'); //ICE gathering status
const signalingStatusLabel = document.getElementById('signaling-status-label');// Signaling status


/**
 * ````````````````````````````````````````
 * Function "Button Connect"
 * every connecton configuration must connected
 * to connected with :
 * 1. ICE gathering status
 * 2. ICE status
 * 3. Peer connection status
 * 4. Signaling status
 */
const connectButton = document.getElementById('connect-button');
connectButton.onclick = async () => {
  if (peerConnection && peerConnection.connectionState === 'connected') { // status terkini dari koneksi antara perangkat lokal dan perangkat jarak jauh.
    return;
  }

  stopAllStreams(); //this function call on bottom
  closePC();

  const sessionResponse = await fetch(`${DID_API.url}/talks/streams`, { // fetch to make HTTP request to endpoint in method POST
    method: 'POST',
    headers: {'Authorization': `Basic ${DID_API.key}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({//change js object to JSON
      source_url: "https://create-images-results.d-id.com/DefaultPresenters/Emma_f/image.jpeg"
    }),
  });

  //response ini digunakan di berbagai function lainnya
  const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = await sessionResponse.json()
  streamId = newStreamId;
  sessionId = newSessionId;
  
  try {
    sessionClientAnswer = await createPeerConnection(offer, iceServers);
  } catch (e) {
    console.log('error during streaming setup', e);
    stopAllStreams();
    closePC();
    return;
  }

  const sdpResponse = await fetch(`${DID_API.url}/talks/streams/${streamId}/sdp`,
    {
      method: 'POST',
      headers: {Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({answer: sessionClientAnswer, session_id: sessionId})
    });
};
/**
 * `````````````````````````````````````````````````````````````````````````````````````````
 * END of Conection Button
 */

const talkButton = document.getElementById('talk-button');
talkButton.onclick = async () => {
  // connectionState not supported in firefox
  if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {
    const talkResponse = await fetch(`${DID_API.url}/talks/streams/${streamId}`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'script': {
            'type': 'text',
            'provider': {
				type: 'microsoft',
				voice_id: 'Jenny'
			},
			input: 'A butterfly is a type of insect that belongs to the order Lepidoptera, which also includes moths. Butterflies are known for their vibrant colors and unique patterns on their wings, which are made up of tiny scales. These scales reflect light and give the butterfly its signature appearance. Butterflies undergo a process of metamorphosis, which includes four distinct stages: egg, larva, pupa, and adult. During the larva stage, the butterfly takes the form of a caterpillar and feeds on plants. Once it enters the pupa stage, it forms a chrysalis or cocoon where it undergoes a transformation into an adult butterfly. Butterflies are important pollinators, helping to fertilize plants as they feed on nectar. They also play a significant role in the ecosystem as a food source for other animals. Due to habitat destruction and other factors, many species of butterflies are currently at risk of extinction, making their conservation an important concern for biodiversity.',
			ssml: 'false'
            // 'type': 'audio',
            // 'audio_url': 'https://d-id-public-bucket.s3.us-west-2.amazonaws.com/webrtc.mp3',
          },
          'driver_url': 'bank://lively/',
          'config': {
            // 'stitch': true,
			fluent: 'false',
			pad_audio: '0.0'
          },
          'session_id': sessionId
        })
      });
  }};

const destroyButton = document.getElementById('destroy-button');
destroyButton.onclick = async () => {
  await fetch(`${DID_API.url}/talks/streams/${streamId}`,
    {
      method: 'DELETE',
      headers: {Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({session_id: sessionId})
    });

  stopAllStreams();
  closePC();
};

function onIceGatheringStateChange() {
  iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  iceGatheringStatusLabel.className = 'iceGatheringState-' + peerConnection.iceGatheringState;
}
function onIceCandidate(event) {
  console.log('onIceCandidate', event);
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;
    
    fetch(`${DID_API.url}/talks/streams/${streamId}/ice`,
      {
        method: 'POST',
        headers: {Authorization: `Basic ${DID_API.key}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({ candidate, sdpMid, sdpMLineIndex, session_id: sessionId})
      }); 
  }
}
function onIceConnectionStateChange() {
  iceStatusLabel.innerText = peerConnection.iceConnectionState;
  iceStatusLabel.className = 'iceConnectionState-' + peerConnection.iceConnectionState;
  if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
    stopAllStreams();
    closePC();
  }
}
function onConnectionStateChange() {
  // not supported in firefox
  peerStatusLabel.innerText = peerConnection.connectionState;
  peerStatusLabel.className = 'peerConnectionState-' + peerConnection.connectionState;
}
function onSignalingStateChange() {
  signalingStatusLabel.innerText = peerConnection.signalingState;
  signalingStatusLabel.className = 'signalingState-' + peerConnection.signalingState;
}
function onTrack(event) {
  const remoteStream = event.streams[0];
  setVideoElement(remoteStream);
}

/**
 * Anonymous function to set the value of let peerConnection
 * 
 * 
 */
async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({iceServers});
    peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
    peerConnection.addEventListener('icecandidate', onIceCandidate, true);
    peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
    peerConnection.addEventListener('connectionstatechange', onConnectionStateChange, true);
    peerConnection.addEventListener('signalingstatechange', onSignalingStateChange, true);
    peerConnection.addEventListener('track', onTrack, true);
  }

  await peerConnection.setRemoteDescription(offer);
  console.log('set remote sdp OK');

  const sessionClientAnswer = await peerConnection.createAnswer();
  console.log('create local sdp OK');

  await peerConnection.setLocalDescription(sessionClientAnswer);
  console.log('set local sdp OK');

  return sessionClientAnswer;
}

function setVideoElement(stream) {
  if (!stream) return;
  talkVideo.srcObject = stream;

  // safari hotfix
  if (talkVideo.paused) {
    talkVideo.play().then(_ => {}).catch(e => {});
  }
}

/**
 * stopAllStreams
 * 
 * to stop video an set in null (i think it reset function)
 */
function stopAllStreams() {
  if (talkVideo.srcObject) { //to get or set media like video or audio
    console.log('stopping video streams');
    talkVideo.srcObject.getTracks().forEach(track => track.stop());
    talkVideo.srcObject = null;
  }
}

/**
 * 
 * peer connection ini ada di let untuk get atau set video
 */
function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log('stopping peer connection');
  pc.close();
  pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
  pc.removeEventListener('icecandidate', onIceCandidate, true);
  pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
  pc.removeEventListener('connectionstatechange', onConnectionStateChange, true);
  pc.removeEventListener('signalingstatechange', onSignalingStateChange, true);
  pc.removeEventListener('track', onTrack, true);
  iceGatheringStatusLabel.innerText = '';
  signalingStatusLabel.innerText = '';
  iceStatusLabel.innerText = '';
  peerStatusLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}
