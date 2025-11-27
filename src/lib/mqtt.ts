import mqtt from 'mqtt';

interface MqttConfig {
  brokerUrl: string;
  options?: mqtt.IClientOptions;
}

class MqttClient {
  private client: mqtt.MqttClient | null = null;
  private static instance: MqttClient;
  private callbacks: { [topic: string]: ((message: any) => void)[] } = {};

  private constructor() {}

  public static getInstance(): MqttClient {
    if (!MqttClient.instance) {
      MqttClient.instance = new MqttClient();
    }
    return MqttClient.instance;
  }

  public connect(config: MqttConfig) {
    if (this.client?.connected) return;

    console.log('Connecting to MQTT broker...', config.brokerUrl);
    this.client = mqtt.connect(config.brokerUrl, config.options);

    this.client.on('connect', () => {
      console.log('MQTT Connected');
      // Resubscribe to existing topics
      Object.keys(this.callbacks).forEach(topic => {
        this.client?.subscribe(topic);
      });
    });

    this.client.on('error', (err) => {
      console.error('MQTT Error:', err);
    });

    this.client.on('message', (topic, message) => {
      if (this.callbacks[topic]) {
        try {
          const payload = JSON.parse(message.toString());
          this.callbacks[topic].forEach(cb => cb(payload));
        } catch (e) {
          console.error('Failed to parse MQTT message:', e);
        }
      }
    });
  }

  public subscribe(topic: string, callback: (message: any) => void) {
    if (!this.callbacks[topic]) {
      this.callbacks[topic] = [];
      if (this.client?.connected) {
        this.client.subscribe(topic);
      }
    }
    this.callbacks[topic].push(callback);
  }

  public unsubscribe(topic: string, callback: (message: any) => void) {
    if (this.callbacks[topic]) {
      this.callbacks[topic] = this.callbacks[topic].filter(cb => cb !== callback);
      if (this.callbacks[topic].length === 0) {
        delete this.callbacks[topic];
        if (this.client?.connected) {
          this.client.unsubscribe(topic);
        }
      }
    }
  }

  public publish(topic: string, message: any) {
    if (this.client?.connected) {
      this.client.publish(topic, JSON.stringify(message));
    } else {
      console.warn('MQTT client not connected. Cannot publish to', topic);
    }
  }
}

export const mqttClient = MqttClient.getInstance();
